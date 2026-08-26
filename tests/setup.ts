import { join, sep } from "node:path";

const repositoryRoot = join(import.meta.dir, "..");
const clientRoot = join(repositoryRoot, "client");
const clientSourceRoot = join(clientRoot, "src");
const serverRoot = join(repositoryRoot, "server");

// A raw `bun test` from the repository root discovers tests in every
// workspace. Both workspaces use `@/`, but each alias points somewhere
// different, so root-level resolution cannot be expressed with one static
// tsconfig path. Resolve it from the importing file instead.
Bun.plugin({
  name: "roomflix-test-workspace-aliases",
  setup(builder) {
    builder.onResolve({ filter: /^@shared\// }, ({ path }) => ({
      path: join(serverRoot, path.slice("@shared/".length)),
    }));

    builder.onResolve({ filter: /^@\// }, ({ importer, path }) => {
      if (isWithin(importer, clientRoot)) {
        return { path: join(clientSourceRoot, path.slice("@/".length)) };
      }
      if (isWithin(importer, serverRoot)) {
        return { path: join(serverRoot, path.slice("@/".length)) };
      }
      return undefined;
    });
  },
});

function isWithin(filePath: string, directory: string): boolean {
  return filePath === directory || filePath.startsWith(`${directory}${sep}`);
}
