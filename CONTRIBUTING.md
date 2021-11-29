# Contributing

:+1::tada: First off, thanks for taking the time to contribute! :tada::+1:

We welcome contributions of any kind including documentation, organization,
tutorials, bug reports, issues, feature requests, feature implementations, pull
requests, answering questions on the mailing list, helping to manage issues,
etc.


## Asking Support Questions

We use mailing list [ntt@groups.io](mailto:ntt@groups.io) where users and
developers can ask questions. Please don't use the GitHub issue tracker to ask
questions.


## Reporting Issues

If you believe you have found an issue, please use the GitHub issue tracker
to report the Problem. If you're not sure if it's a bug or not, start by asking
on the mailing list [ntt@groups.io](mailto:ntt@groups.io).


## Pull Requests

0. [Fork][fork] and clone the repository
0. Create a new branch: `git checkout -b my-branch-name`
0. Make your change and remember to add tests
0. Build the project locally and run local tests
0. Push to your fork and [submit a pull request][pr]
0. Pat your self on the back and wait for your pull request to be reviewed and merged.

Here are a few things you can do that will increase the likelihood of your pull
request being accepted:

* Write tests.
* Format your code.
* Keep your change as focused as possible. If there are multiple changes you
  would like to make that are not dependent upon each other, submit them as
  separate pull requests.
* Write [good commit messages](https://chris.beams.io/posts/git-commit/).


## Troubleshoot

### Cannot install vsce globally (permission denied)

This [fedora page](https://developer.fedoraproject.org/tech/languages/nodejs/nodejs.html) suggest
creating a directory for global installations inside your home directory:

	mkdir ~/.npm-global

Set the new directory path for npm:

	npm config set prefix '~/.npm-global'

Open/create the `~/.profile` file and add the following line:

	export PATH=~/.npm-global/bin:$PATH

Update your system variables with this command:

	source ~/.profile

Install vsce:

	npm install -g vsce





## Issue and Pull Request Labels

Labels help us track and manage issues and pull requests.

| Label Name         |                                    | Description
| ------------------ | ---------------------------------- | -----------
| `enhancement`      | [search][search-label-enhancement] | Feature Requests
| `bug`              | [search][search-label-bug]         | Something isn't working
| `duplicate`        | [search][search-label-duplicate]   | This issue or pull request already exists
| `good first issue` | [search][search-label-first]       | Good for newcomers
| `help wanted`      | [search][search-label-help]        | Extra attention is needed
| `invalid`          | [search][search-label-invalid]     | This doesn't seem right
| `question`         | [search][search-label-question]    | Further information is requested
| `wontfix`          | [search][search-label-wontfix]     | This will not be worked on

## Resources

* [How to Contribute to Open Source](https://opensource.guide/how-to-contribute/)
* [Using Pull Requests](https://help.github.com/articles/about-pull-requests/)
* [GitHub Help](https://help.github.com)


[fork]: https://github.com/nokia/vscode-ttcn3/fork
[pr]: https://github.com/nokia/vscode-ttcn3/compare
[code-of-conduct]: CODE_OF_CONDUCT.md
[search-label-enhancement]: https://github.com/nokia/vscode-ttcn3/labels/enhancement
[search-label-duplicate]: https://github.com/nokia/vscode-ttcn3/labels/duplicate
[search-label-first]: https://github.com/nokia/vscode-ttcn3/labels/good%20first%20issue
[search-label-help]: https://github.com/nokia/vscode-ttcn3/labels/help%20wanted
[search-label-invalid]: https://github.com/nokia/vscode-ttcn3/labels/invalid
[search-label-question]: https://github.com/nokia/vscode-ttcn3/labels/question
[search-label-wontfix]: https://github.com/nokia/vscode-ttcn3/labels/wontfix
