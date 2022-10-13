import fs = require('fs');
import path = require('path');
import * as child_process from "child_process";
import * as vscode from 'vscode';
import { ExtensionContext, OutputChannel } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, ExecuteCommandParams, ExecuteCommandRequest, DidChangeConfigurationParams, DidChangeConfigurationNotification } from 'vscode-languageclient/node';
import { LOG } from './util/logger';
import { ServerDownloader } from './serverDownloader';
import { Status, StatusBarEntry } from './util/status';
import { isOSUnixoid, correctBinname } from './util/osUtils';

let client: LanguageClient;
let outputChannel: OutputChannel;

export function activate(context: ExtensionContext) {

	outputChannel = vscode.window.createOutputChannel("TTCN-3", "ttcn3-out");
	//testExecOutChannel = vscode.window.createOutputChannel("TTCN-3-Test");
	context.subscriptions.push(outputChannel);

	const conf = vscode.workspace.getConfiguration('ttcn3');

	// Our work is done, if the user does not want to run a language server.
	if (!conf.get('useLanguageServer') && !conf.get('server.enabled')) {
		outputChannel.appendLine('Language server is disabled. If you like to use features like go to definition, enable the language server by opening vscode settings and set ttcn3.useLanguageServer to true. For more information about the TTCN-3 language server, have a look at https://nokia.github.io/ntt/editors/');

		context.subscriptions.push(vscode.commands.registerCommand("ttcn3.languageServer.restart", async () => {
			outputChannel.appendLine("Restart command is not available, please enable TTCN-3 Language Server in vscode settings.");
		}));

		context.subscriptions.push(vscode.commands.registerCommand("ttcn3.languageServer.status", async () => {
			outputChannel.appendLine("Status command is not available, please enable TTCN-3 Language Server in vscode settings.");
		}));

		context.subscriptions.push(vscode.commands.registerCommand("ttcn3.languageServer.debug.toggle", async () => {
			outputChannel.appendLine("Toggle debug command is not available, please enable TTCN-3 Language Server in vscode settings.");
		}));
		return;
	}

	const initTasks: Promise<void>[] = [];

	initTasks.push(withSpinningStatus(context, async status => {
		await activateLanguageServer(context, status, conf);
	}));
}

async function withSpinningStatus(context: vscode.ExtensionContext, action: (status: Status) => Promise<void>): Promise<void> {
	const status = new StatusBarEntry(context, "$(sync~spin)");
	status.show();
	await action(status);
	status.dispose();
}

export async function activateLanguageServer(context: vscode.ExtensionContext, status: Status, conf: vscode.WorkspaceConfiguration) {

	outputChannel.appendLine('Activating TTCN-3 Language Server...');
	status.update('Activating Activating TTCN-3 Language Server...');

	const installDir = path.join(context.extensionPath, "servers");
	const nttDownloader = new ServerDownloader("TTCN-3 Language Server", "ntt", assetName(), installDir, outputChannel);

	if (conf.get('server.update')) {
		try {
			await nttDownloader.downloadServerIfNeeded(status);
			// Ensure that start script can be executed
			if (isOSUnixoid()) {
				child_process.exec(`chmod +x ${installDir}/ntt`);
			}
		} catch (error) {
			console.error(error);
			vscode.window.showWarningMessage(`Could not update/download TTCN-3 Language Server: ${error}`);
			return;
		}
	}

	const ntt = await findNttExecutable(installDir);
	let toolsPath: string = "";
	let separator: string;
	if (getOs() === 'windows') {
		separator = ';';
	} else {
		separator = ':';
	}
	let pathList: string[] | undefined = conf.get('server.toolsPath');
	var libraryList: string[] = new Array();
	let libraryPath: string = "";
	if (pathList) {
		if (getOs() != 'windows') {
			pathList.forEach(element => {
				libraryList.push(element + '/../lib64');
				libraryList.push(element + '/../lib');
			});
			libraryPath = libraryList.join(separator);
			libraryPath = libraryPath + separator + process.env['LD_LIBRARY_PATH']!;
		}
		toolsPath = pathList.join(separator);
		if (toolsPath.length > 0) {
			toolsPath = toolsPath + separator + process.env['PATH']!;
		} else {
			toolsPath = process.env['PATH']!;
		}
	}
	outputChannel.appendLine('toolsPath: ' + toolsPath);
	let serverOptions: ServerOptions = {
		run: { command: ntt, args: ['langserver'], options: { env: process.env } },
		debug: { command: ntt, args: ['langserver'], options: { env: process.env } }
	};
	if (serverOptions.debug.options) {
		serverOptions.debug.options.env['PATH'] = toolsPath;
		if (libraryPath.length > 0) {
			serverOptions.debug.options.env['LD_LIBRARY_PATH'] = libraryPath;
		}
	}
	if (serverOptions.run.options) {
		serverOptions.run.options.env['PATH'] = toolsPath;
		if (libraryPath.length > 0) {
			serverOptions.run.options.env['LD_LIBRARY_PATH'] = libraryPath;
		}
	}

	let clientOptions: LanguageClientOptions = {
		documentSelector: ['ttcn3'],
		outputChannel: outputChannel
	};

	// Create the language client and start the client.
	status.update(`Initializing TTCN-3 Language Server...`);
	client = new LanguageClient('ttcn3', 'TTCN-3 Language Server', serverOptions, clientOptions);
	try {
		await client.start();
	} catch (e) {
		if (e instanceof Error) {
			vscode.window.showInformationMessage('Could not start the TTCN-3 Language Server:', e.message);
		} else if (typeof e === 'string') {
			vscode.window.showInformationMessage('Could not start the TTCN-3 Language Server:', e);
		} else {
			vscode.window.showInformationMessage('Could not start the TTCN-3 Language Server: unknown error');
		}
		return;
	}

	context.subscriptions.push(vscode.commands.registerCommand("ttcn3.languageServer.restart", async () => {
		await client.stop();

		outputChannel.appendLine("");
		outputChannel.appendLine(" === Language Server Restart ===");
		outputChannel.appendLine("");

		await client.start();
	}));

	context.subscriptions.push(vscode.commands.registerCommand("ttcn3.languageServer.status", async () => {
		const params: ExecuteCommandParams = { command: "ntt.status", arguments: [] };
		await client.sendRequest(ExecuteCommandRequest.type, params);
	}));

	context.subscriptions.push(vscode.commands.registerCommand("ttcn3.languageServer.debug.toggle", async () => {
		const params: ExecuteCommandParams = { command: "ntt.debug.toggle", arguments: [] };
		await client.sendRequest(ExecuteCommandRequest.type, params);
	}));

	context.subscriptions.push(vscode.commands.registerCommand("ntt.test", async (args) => {
		const params: ExecuteCommandParams = { command: "ntt.test", arguments: [args] };
		await client.sendRequest(ExecuteCommandRequest.type, params);
	}));
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
			// react on any configuration change.
			// Let the server decide what is usefull
			const params: DidChangeConfigurationParams = { settings: undefined };
			client.sendNotification(DidChangeConfigurationNotification.type, params);
		}));
}

async function findNttExecutable(installDir: string): Promise<string> {
	let ntt = correctBinname("ntt");
	let nttPath = path.join(installDir, ntt);

	// Try installed binary
	if (fs.existsSync(nttPath)) {
		return nttPath;
	}

	// Then search PATH parts
	if (process.env['PATH']) {
		outputChannel.append("Looking for ntt in PATH...");

		let pathparts = process.env['PATH'].split(path.delimiter);
		for (let i = 0; i < pathparts.length; i++) {
			let binpath = path.join(pathparts[i], ntt);
			if (fs.existsSync(binpath)) {
				outputChannel.appendLine(binpath);
				return binpath;
			}
		}
		outputChannel.appendLine("");
	}

	let p = process.env['PATH'];
	outputChannel.appendLine(`Could not find ntt in ${p}, will try using binary name directly`);
	return ntt;
}

function assetName(): string {
	const os = getOs();
	const arch = getArch();
	return `ntt_${os}_${arch}.tar.gz`;
}

function getOs(): string {
	let platform = process.platform.toString();
	if (platform === 'win32') {
		return 'windows';
	}
	return platform;
}

function getArch(): string {
	let arch = process.arch;

	if (arch === 'ia32') {
		return 'i386';
	}
	if (arch === 'x64') {
		return 'x86_64';
	}
	if (arch === 'arm64' && process.platform.toString() === 'darwin') {
		// On Apple Silicon, install the amd64 version and rely on Rosetta2
		// until a native build is available.
		return 'x86_64';
	}
	return arch;
}
export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
