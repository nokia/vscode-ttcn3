[![](https://vsmarketplacebadge.apphb.com/version-short/nokia.ttcn3.svg)](https://marketplace.visualstudio.com/items?itemName=nokia.ttcn3)
[![](https://vsmarketplacebadge.apphb.com/downloads-short/nokia.ttcn3.svg)](https://marketplace.visualstudio.com/items?itemName=nokia.ttcn3)
[![](https://vsmarketplacebadge.apphb.com/rating-star/nokia.ttcn3.svg)](https://marketplace.visualstudio.com/items?itemName=nokia.ttcn3)
[![](https://aka.ms/vsls-badge)](https://aka.ms/vsls-gitlens)


# TTCN-3 for Visual Studio Code

<img width="40%" align="right" src="images/highlight.png"/>

#### [Repository](https://github.com/nokia/vscode-ttcn3)&nbsp;&nbsp;|&nbsp;&nbsp;[Issues](https://github.com/nokia/vscode-ttcn3/issues)&nbsp;&nbsp;|&nbsp;&nbsp;[Documentation](https://nokia.github.io/ntt/editors/#visual-studio-code)

Adds language support for [TTCN-3](https://nokia.github.io/ntt/#whats-ttcn-3)
to Visual Studio Code. Available features:

* Syntax Highlighting.
* Code Snippets for quick coding.
* Jump to Definition for quick navigation.
* Code completion for a growing number of module defintions.
* Find references
* CodeLens for running tests from inside your IDE (experimental).
* And more features to come...


If you find this extension useful, please [write a review](https://marketplace.visualstudio.com/items?itemName=nokia.ttcn3#review-details 'Write a review')
and [star it on GitHub](https://github.com/nokia/vscode-ttcn3 'Star it on GitHub').

<br clear="right"/>


## IntelliSense

IntelliSense is powered by the [ntt language server](https://nokia.github.io/ntt) and is still experimental.
Enable the TTCN-3 language server to use IntelliSense features. ntt updates and installs automatically.


<img src="images/vscode-ttcn3-settings.png"/>


## Troubleshooting

**Unknown Module Locations**

IntelliSense works only for known TTCN-3 modules. Yet, there is no standard
way of telling the language server where to look for TTCN-3 modules.  

You should always open whole folders (`Open > Folder`) and not just
single files (`Open > File`). The language server automatically recognizes all
TTCN-3 from that opened folder.  

The command _"TTCN-3: Show language server status"_ shows a list of all known
TTCN-3 modules and will help to verify that all relevant modules are known by
the language server

If you do not open the right folders, very little will work. This is the most
common issue that we see. You can improve this situation by creating a manifest
file as described in the [documentation](https://nokia.github.io/ntt). If you
have suggestions on how to improve this further, we'd love to hear from you.


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
