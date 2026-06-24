export type StarterFramework = "generic" | "nextjs" | "express" | "fastapi";
export interface StarterFile {
    relativePath: string;
    content: string;
}
export interface FrameworkStarter {
    framework: StarterFramework;
    files: StarterFile[];
}
export declare function createFrameworkStarter(frameworkName: string): FrameworkStarter;
export declare function listSupportedFrameworks(): StarterFramework[];
