import * as path from 'path';
import * as vscode from 'vscode';
import {commands, ExtensionContext, OutputChannel, workspace} from 'vscode';
import {LanguageClient, LanguageClientOptions, ServerOptions, TransportKind} from 'vscode-languageclient';
import * as WebSocket from 'ws';

let client: LanguageClient;

export function activate(context: ExtensionContext) {

  if (workspace.getConfiguration('ttcn3').get('useLanguageServer')) {
     return
  }

  console.log('Activating language server for ttcn3');

  let serverOptions: ServerOptions = {
    run: {command: 'k3', args: ['langserver']},
    debug: {command: 'k3', args: ['langserver']}
  };

  const socketPort = workspace.getConfiguration('ttcn3').get('port', 7000);
  let socket: WebSocket|null = null;

  commands.registerCommand('ttcn3.startStreaming', () => {
    socket = new WebSocket(`ws://localhost:${socketPort}`);
  });

  let log = '';
  const websocketOutputChannel: OutputChannel = {
    name: 'websocket',
    // Only append the logs but send them later
    append(value: string) {
      log += value;
      console.log(value);
    },
    appendLine(value: string) {
      log += value;
      // Don't send logs until WebSocket initialization
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(log);
      }
      log = '';
    },
    clear() {},
    show() {},
    hide() {},
    dispose() {}
  };

  let clientOptions: LanguageClientOptions = {
    documentSelector: ['ttcn3'],
    // outputChannel: websocketOutputChannel
  };

  // Create the language client and start the client.
  client = new LanguageClient(
      'ttcn3', 'TTCN-3 Language Server', serverOptions, clientOptions);
  client.registerProposedFeatures();
  try {
    context.subscriptions.push(client.start());
  } catch (e) {
    vscode.window.showInformationMessage('Could ot start the TTCN-3 language server. Please install k3-tool from http://github.com/nokia/ntt.')
  }
}

export function deactivate(): Thenable<void>|undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
