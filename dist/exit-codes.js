export const ExitCode = {
    OK: 0,
    GENERAL_ERROR: 1,
    USAGE: 64,
    API_UNAVAILABLE: 69,
    TEMPORARY_FAILURE: 75,
    AUTH_REQUIRED: 77,
    CONFIG: 78,
    INTERRUPTED: 130,
};
export function classifyError(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/missing clink secret key|dashboard console token|access token|api key|unauthorized|authentication/i.test(message)) {
        return ExitCode.AUTH_REQUIRED;
    }
    if (/missing required option|invalid command|unknown command|unknown option|required option|option .* must be|invalid metadata/i.test(message)) {
        return ExitCode.USAGE;
    }
    if (/config|profile|environment|base url|webhook signing key/i.test(message)) {
        return ExitCode.CONFIG;
    }
    if (/clink api|fetch failed|network|timeout|econnrefused|enotfound/i.test(message)) {
        return ExitCode.API_UNAVAILABLE;
    }
    return ExitCode.GENERAL_ERROR;
}
//# sourceMappingURL=exit-codes.js.map