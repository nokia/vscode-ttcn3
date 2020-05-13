import fs = require('fs');
import path = require('path');
import os = require('os');
import * as vscode from 'vscode';
import { commands, ExtensionContext, OutputChannel, workspace } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';
import * as WebSocket from 'ws';

let client: LanguageClient;

export function activate(context: ExtensionContext) {

  if (!workspace.getConfiguration('ttcn3').get('useLanguageServer')) {
    return;
  }

  console.log('Activating language server for ttcn3');

  let ntt = findExecutable('ntt');

  // Old versions of ntt had a different name. Try that one, too.
  if (!ntt) {
    ntt = findExecutable('k3');
  }

  if (!ntt) {
    vscode.window.showInformationMessage('Could not find the TTCN-3 language server. Please check if the tool ntt from http://github.com/nokia/ntt is properly installed and reachable for Visual Studio Code.');
    return;
  }


  let serverOptions: ServerOptions = {
    run: { command: ntt, args: ['langserver'] },
    debug: { command: ntt, args: ['langserver'] }
  };

  const socketPort = workspace.getConfiguration('ttcn3').get('port', 7000);
  let socket: WebSocket | null = null;

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
    clear() { },
    show() { },
    hide() { },
    dispose() { }
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
    vscode.window.showInformationMessage('Could ot start the TTCN-3 language server:', e);
  }
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}

function findExecutable(name: string): string | null {
  const envPath = process.env['PATH'] || (process.platform === 'win32' ? process.env['Path'] : null);
  if (envPath) {
    const dirs = envPath.split(path.delimiter);
    for (const dir of dirs) {
      const execPath = path.join(dir, fixExecutableName(name));
      if (fileExists(execPath)) {
        return execPath;
      }
    }
  }
  return null;
}

function fixExecutableName(name: string) {
  if (process.platform === 'win32') {
    return name + '.exe';
  }
  return name;
}

function fileExists(filePath: string): boolean {
  let exists = true;
  try {
    exists = fs.statSync(filePath).isFile();
    if (exists) {
      fs.accessSync(filePath, fs.constants.F_OK | fs.constants.X_OK);
    }
  } catch (e) {
    exists = false;
  }
  return exists;
}

