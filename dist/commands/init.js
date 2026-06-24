import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { printResult } from "../output.js";
import { createFrameworkStarter, listSupportedFrameworks } from "../starters.js";
import { getCommandContext } from "./helpers.js";
export function registerInit(program) {
    program
        .command("init")
        .description("Generate starter integration artifacts in the current project")
        .option("--out <directory>", "Output directory", ".")
        .option("--framework <name>", "Starter framework: generic, nextjs, express, or fastapi", "generic")
        .option("--force", "Overwrite existing files")
        .action(async (options, command) => {
        const { config } = await getCommandContext(command);
        const starter = createFrameworkStarter(options.framework);
        const files = starter.files.map((file) => ({
            path: join(options.out, file.relativePath),
            content: file.content,
        }));
        for (const file of files) {
            await mkdir(dirname(file.path), { recursive: true });
            await writeFile(file.path, file.content, { encoding: "utf8", flag: options.force ? "w" : "wx" });
        }
        printResult({
            framework: starter.framework,
            out: options.out,
            files: files.map((file) => file.path),
            supportedFrameworks: listSupportedFrameworks(),
        }, config.outputMode, `Generated ${files.length} Clink ${starter.framework} starter artifact(s) in ${options.out}`);
    });
}
//# sourceMappingURL=init.js.map