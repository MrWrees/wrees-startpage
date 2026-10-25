{
  description = "Local Firefox and Zen start page with Home Manager integration";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { nixpkgs, ... }:
    let
      forSystems = nixpkgs.lib.genAttrs [ "x86_64-linux" "aarch64-linux" ];
    in
    {
      homeModules.default = import ./nix/module.nix;

      packages = forSystems (system:
        let pkgs = import nixpkgs { inherit system; };
        in {
          default = pkgs.callPackage ./nix/package.nix { };
        });

      checks = forSystems (system:
        let pkgs = import nixpkgs { inherit system; };
        in {
          tests = pkgs.runCommand "wrees-startpage-tests" {
            nativeBuildInputs = [ pkgs.python3 pkgs.nodejs ];
          } ''
            cp -r ${./.} source
            chmod -R u+w source
            cd source
            python3 -I -B -m unittest discover -s tests -p 'test_*.py'
            node --test tests/*.test.mjs
            touch "$out"
          '';
        });

      devShells = forSystems (system:
        let pkgs = import nixpkgs { inherit system; };
        in {
          default = pkgs.mkShell {
            packages = [ pkgs.python3 pkgs.nodejs pkgs.web-ext ];
          };
        });
    };
}
