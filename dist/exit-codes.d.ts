export declare const ExitCode: {
    readonly OK: 0;
    readonly GENERAL_ERROR: 1;
    readonly USAGE: 64;
    readonly API_UNAVAILABLE: 69;
    readonly TEMPORARY_FAILURE: 75;
    readonly AUTH_REQUIRED: 77;
    readonly CONFIG: 78;
    readonly INTERRUPTED: 130;
};
export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];
export declare function classifyError(error: unknown): ExitCodeValue;
