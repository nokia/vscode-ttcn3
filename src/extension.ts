import * as path from 'path';
import * as vscode from 'vscode';
import { workspace, ExtensionContext } from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TransportKind
} from 'vscode-languageclient';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
	console.log('Activating extension language-ttcn3');

	let serverOptions: ServerOptions = {
		run: { command: 'k3', args: ['langserver'] },
		debug: { command: 'k3', args: ['langserver'] }
	};

	let clientOptions: LanguageClientOptions = {
		documentSelector: ['ttcn3']
	};

	// Create the language client and start the client.
	client = new LanguageClient('TTCN-3 Language Server', serverOptions, clientOptions);
	client.registerProposedFeatures();
	try {
		context.subscriptions.push(client.start());
	} catch (e) {
		vscode.window.showErrorMessage('Could ot start the TTCN-3 language server.');
	}
}

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}
