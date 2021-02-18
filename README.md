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

If you like to use features like go to definition, enable ntt by opening [vscode
settings](https://code.visualstudio.com/docs/getstarted/settings) and set
`ttcn3.useLanguageServer` to `true`.


### Troubleshooting: Go to Definition does not work


**Unknown Module Locations**

Go to Definition works only for known TTCN-3 modules. Yet, there is no standard
way of telling the language server where to look for TTCN-3 modules.  

You should always open whole folders (`Open > Folder`) and not just
single files (`Open > File`). The language server automatically recognizes all
TTCN-3 from that opened folder.  
If your TTCN-3 test suite is organized across multiple folders, a [test suite manifest
file](https://nokia.github.io/ntt/getting-started#the-test-suite-manifest)
should be in the test suite's root folder.  
When you open multiple folders (workspace), the first folder is considered the
test suite root folder.

The command "TTCN-3: Show language server status" shows a list of all known
TTCN-3 modules and will help to verify that all relevant modules are known by
the language server

If you do not open the right folders, very little will work. This is the most
common issue that we see. If you have suggestions on how to improve this, we'd
love to hear from you.


**Work in Progress**

The language server is still work in progress. Not all TTCN-3 semantic is
implemented already, therefore some TTCN-3 structure might not work as
expected:

* _Component Variables_
* _Signatures_
* _Dot Expressions_ (such as `foo.bar`)
* _Ambiguous Module Definitions_ (only the first hit is returned)


## Contribution

We are pushing hard to get to you as many features as soon as possible, but
there's still much to do in every corner. Help is very much appreciated. 

Kindly, have a look at our [contribution guide](CONTRIBUTING.md).


## License

This project is licensed under the BSD-3-Clause license - see the [LICENSE](https://github.com/nokia/vscode-ttcn3/blob/master/LICENSE).
