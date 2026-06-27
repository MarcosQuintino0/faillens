export type FailLensTheme = "dark" | "light";

export interface FailLensConfig {
  outputDir?: string;
  projectName?: string;
  runId?: string;
  branch?: string;
  theme?: FailLensTheme;
  maskFields?: string[];
  cypressConfigFile?: string;
}

export interface ResolvedFailLensConfig {
  outputDir: string;
  projectName?: string;
  runId?: string;
  branch?: string;
  theme: FailLensTheme;
  maskFields: string[];
  cypressConfigFile?: string;
}
