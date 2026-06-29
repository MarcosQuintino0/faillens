import { generateCommand } from "./generate";
import { initCommand } from "./init";
import { openCommand } from "./open";
import { runCommand } from "./run";

function printHelp(): void {
  console.log(`FailLens 0.1.0 — relatório local para testes de API com Cypress

Uso:
  faillens run [-- argumentos do Cypress]
  faillens run --open [-- argumentos do Cypress]
  faillens init
  faillens generate --input caminho.json --output caminho.html
  faillens open [--report diretório] [--port número] [--no-browser]
  faillens --help`);
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  return inline?.slice(name.length + 1);
}

export async function main(args = process.argv.slice(2)): Promise<number> {
  const command = args[0];
  if (!command || command === "--help" || command === "-h" || command === "help") {
    printHelp();
    return 0;
  }
  if (command === "init") return initCommand();
  if (command === "open") {
    const port = optionValue(args, "--port");
    const parsedPort = port ? Number(port) : undefined;
    if (parsedPort !== undefined && (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)) {
      throw new Error("--port deve ser um número inteiro entre 1 e 65535.");
    }
    return openCommand({
      report: optionValue(args, "--report") || (args[1] && !args[1].startsWith("--") ? args[1] : undefined),
      port: parsedPort,
      browser: !args.includes("--no-browser"),
    });
  }
  if (command === "generate") {
    return generateCommand({
      input: optionValue(args, "--input"),
      output: optionValue(args, "--output"),
      open: args.includes("--open"),
    });
  }
  if (command === "run") {
    const separator = args.indexOf("--");
    const faillensArgs = separator >= 0 ? args.slice(1, separator) : args.slice(1);
    const forwarded = separator >= 0
      ? args.slice(separator + 1)
      : faillensArgs.filter((argument) => argument !== "--open" && argument !== "--no-open");
    return runCommand(forwarded, process.cwd(), { open: faillensArgs.includes("--open") });
  }
  throw new Error(`Comando desconhecido: ${command}. Use "faillens --help".`);
}

void main().then(
  (code) => { process.exitCode = code; },
  (error) => {
    console.error(`[FailLens] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  },
);
