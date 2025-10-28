# Easy RISC-V

https://dramforever.github.io/easyriscv

## Build

[Pandoc] is required. The build command is:

[Pandoc]: https://pandoc.org/

```
pandoc --toc --template=template.html --lua-filter=filter.lua --variable=date:"$(date --utc +"%F %R")" -o index.html index.md
```

## License

This tutorial is provided under the [CC0] license. To the maximum extent permitted by law, this tutorial is dedicated to the public domain.

The associated code in this repository is provided under, of your choosing, either the CC0 license or the [0-clause "BSD"][0bsd] license.

[CC0]: https://creativecommons.org/publicdomain/zero/1.0/
[0bsd]: https://opensource.org/license/0bsd
