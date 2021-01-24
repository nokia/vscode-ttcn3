# TTCN-3 for Visual Studio Code

Adds language support for TTCN-3 to Visual Studio Code. This extension is a fork
of [Emmanuel Alap's TTCN-3 Language Extension](https://github.com/ealap/vscode-language-ttcn)
and adds further smartness. Current features:

* Syntax Highlighting.
* [Code Snippets](https://github.com/nokia/vscode-ttcn3/blob/master/snippets/ttcn.tmSnippet.json) for quick coding.
* Jump to Definition (when TTCN-3 Language Server is enabled).
* And more features to come...


## Language Server

Most features of this extensions are provided by the [ntt language
server](http://nokia.github.io/ntt/editors). It's still in beta and
therefore disabled by default.

If you like to use features like go to defintion, enable ntt by opening [vscode
settings](https://code.visualstudio.com/docs/getstarted/settings) and set
`ttcn3.useLanguageServer` to `true`.


**Opening Folders**

This is very important. Go to defintion works only for known TTCN-3 modules.
Therefore you should always open whole folders (`Open > Folder`) and not just
single files (`Open > File`). ntt automatically recognizes all TTCN-3 from that
folder than.

When you open multiple folders, the first one is considered the test suite root
folder and should contain a [test suite manifest
file](https://nokia.github.io/ntt/getting-started#the-test-suite-manifest).  

If you do not open the right folders, very little will work. This is the most
common issue of ntt language server that we see.

Unfortunately there isn't much you can do. We are aware of this situation and
plan to improve it as soon as we can.


## Contribution

We are pushing hard to get to you as many features as soon as possible, but
there's still much to do in every corner. Help is very much appreciated. 

Kindly, have a look at our [contribution guide](CONTRIBUTING.md).


## License

This project is licensed under the BSD-3-Clause license - see the [LICENSE](https://github.com/nokia/vscode-ttcn3/blob/master/LICENSE).
