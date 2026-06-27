import { generateCommand } from "./generate";
import { initCommand } from "./init";
import { runCommand } from "./run";

function printHelp(): void {
  console.log(`FailLens 0.1.0 — relatório local para testes de API com Cypress

Uso:
  faillens run [-- argumentos do Cypress]
  faillens init
  faillens generate --input caminho.json --output caminho.html
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
  if (command === "generate") {
    return generateCommand({ input: optionValue(args, "--input"), output: optionValue(args, "--output") });
  }
  if (command === "run") {
    const separator = args.indexOf("--");
    const forwarded = separator >= 0 ? args.slice(separator + 1) : args.slice(1);
    return runCommand(forwarded);
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
