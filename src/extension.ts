import * as vscode from "vscode";

import WebSocketAsPromised = require("websocket-as-promised");

// contstants
const baseUrl: string 		= "ws://localhost:24892/";
const timeout: number 		= 30 * 1000; // ms
const statusTimeout: number = 3 * 1000; // ms

// websocket init
let W3CWebSocket:any = require("websocket").w3cwebsocket;
let wsExecuteClient: WebSocketAsPromised = new WebSocketAsPromised(baseUrl + "execute", {
	createWebSocket: url => new W3CWebSocket(url)
});
let wsAttachClient: WebSocketAsPromised = new WebSocketAsPromised(baseUrl + "attach", {
	createWebSocket: url => new W3CWebSocket(url)
});

let isAlive: boolean;
let runItem: vscode.StatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
runItem.command = "extension.synapseExecute";
runItem.tooltip = "Execute Synapse Memes";
runItem.text = "$(triangle-right) Synapse Execute";

// misc
function addWSListener(websocket: WebSocketAsPromised, callback: (...args: any[]) => any): void {
	websocket.onResponse.addListener(callback);
}

// async things for websocket
function asyncSocketResp(websocket: WebSocketAsPromised): Promise<any> {
    return new Promise((resolve, reject) => {
		var dead: NodeJS.Timer = setTimeout(() => { reject("Websocket Timeout"); }, timeout);
		websocket.onMessage.addOnceListener(data => {
			clearTimeout(dead);
			resolve(data);
		});
    });
}

function asyncOnConnect(websocket: WebSocketAsPromised): Promise<void> {
	return new Promise((resolve, reject) => {
		var dead: NodeJS.Timer = setTimeout(() => { reject("onConnect timeout"); }, timeout);
		websocket.onOpen.addOnceListener(data => {
			clearTimeout(dead);
			resolve(data);
		});
	});
}

function asyncWait(timeMS: number): Promise<void> {
	return new Promise((resolve, reject) => {
		setTimeout(() => resolve(), timeMS);
	});
}

// misc
function resetRunItem():void {
	runItem.text = "$(triangle-right) Synapse Execute";
	runItem.command = "extension.synapseExecute";
	runItem.show();
}

var testval: number = 0;
function test():void {
	console.log("dead", ++testval);
}

// execution function
export function activate({ subscriptions }: vscode.ExtensionContext): void {
	console.log(`synapse execution plugin loaded!`);

	isAlive = true;
	runItem.show();

	let disposable: vscode.Disposable;
	disposable = vscode.commands.registerCommand("extension.synapseExecute", async () => {
		var content: string = vscode.window.activeTextEditor.document.getText();
		if(content.trim() === "") {
			return;
		}

		runItem.command = "";
		runItem.text = "Loading...";
		runItem.show();

		try {
			if(!wsAttachClient.isOpened) {
				await wsAttachClient.open();
			}

			if(!wsExecuteClient.isOpened) {
				await wsExecuteClient.open();
			}

			await wsAttachClient.send("IS_READY");
			var IS_READY: any = await asyncSocketResp(wsAttachClient);
			console.log(`SYNAPSE IS ${IS_READY === "TRUE" ? "" : "NOT "}READY`);
			if(IS_READY !== "TRUE") {
				var currentAttach: any;
				var attach: any;


				await wsAttachClient.send("ATTACH");
				while(isAlive) {
					attach = await asyncSocketResp(wsAttachClient);
					console.log(`SYNAPSE ATTACH ${attach}`);
					if(attach === "READY" || attach === "ALREADY_ATTACHED"
						|| attach === "REATTACH_READY") {
						runItem.text = `SYNAPSE STATUS: READY`;
						break;
					} else if(attach === "NOT_LATEST_VERSION" || attach === "FAILED_TO_FIND"
						|| attach === "INTERRUPT") {
						runItem.text = `$(x) SYNAPSE STATUS: Failed to attach`;
						setTimeout(() => resetRunItem(), statusTimeout);
						return vscode.window.showErrorMessage("Synapse failed to attach", attach);
					}

					if(currentAttach !== attach) {
						runItem.text = `$(watch) SYNAPSE STATUS: ${attach}`;
						currentAttach = attach;
					}
				}
			}

			await wsExecuteClient.send(content);
			var scriptResp: any = await asyncSocketResp(wsExecuteClient);
			if(scriptResp === "OK") {
				vscode.window.showInformationMessage("$(check) Script Executed");
			} else {
				vscode.window.showErrorMessage("Hmm... this shouldn't of happened, please report.");
			}

		} catch(e) {
			const err: string = (<Error>e).message;

			console.log(err);
			// make the failed to connect error a bit more simplistic
			if(err.indexOf("Websocket") && err.includes("connection failed")) {
				return vscode.window.showErrorMessage("Error occured while executing",
					"Couldn't connect to synapse!");
			}

			resetRunItem();
			return vscode.window.showErrorMessage("Error occured while executing", err);
		}

		resetRunItem();
		vscode.window.showInformationMessage("Script executed!");
	});

	subscriptions.push(disposable);
}


export function deactivate():void {
	console.log(`synapse execution plugin shutting down...`);

	isAlive = false;
	runItem.dispose();

	if(wsAttachClient.isOpened) {
		wsAttachClient.close();
	}

	if(wsExecuteClient.isOpened) {
		wsExecuteClient.close();
	}
}
