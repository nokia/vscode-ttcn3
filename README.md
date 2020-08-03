# TTCN-3 for Visual Studio Code

Adds language support for TTCN-3 to Visual Studio Code. This extension is a fork
of [Emmanuel Alap's TTCN-3 Language Extension](https://github.com/ealap/vscode-language-ttcn)
and adds further smartness. Current features:

* Syntax Highlighting.
* [Code Snippets](https://github.com/nokia/vscode-ttcn3/blob/master/snippets/ttcn.tmSnippet.json) for quick coding.
* Jump to Definition (when TTCN-3 Language Server is enabled).
* And more features to come...


## Language Server

TTCN-3 support is powered by the [NTT/K3 Language Server](http://github.com/nokia/ntt).
It's still very much in beta and therefore disabled by default. If you want to
try it out, install `k3` tool somewhere, so this extension can find it.

Set `ttcn3.useLanguageServer` to `true` to enable the use of language server and
reload the extension.


## Contribution

We are pushing hard to get to you as many features as soon as possible, but
there's still much to do in every corner. Help is very much appreciated. 

Kindly, have a look at our [contribution guide](CONTRIBUTING.md).


## License

This project is licensed under the BSD-3-Clause license - see the [LICENSE](https://github.com/nokia/vscode-ttcn3/blob/master/LICENSE).