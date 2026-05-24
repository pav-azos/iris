// Sentry removed — ÍRIS is an academic project (I2A2 InsurMinds RAG course)

type LogContext = Record<string, any>;

export const logger = {
    error: (message: string, error?: any, context: LogContext = {}) => {
        console.error(message, error, context);
    },

    info: (message: string, context: LogContext = {}) => {
        console.log(message, context);
    },

    warn: (message: string, context: LogContext = {}) => {
        console.warn(message, context);
    },

    debug: (message: string, context: LogContext = {}) => {
        if (process.env.LOG_LEVEL === 'debug') {
            console.debug(message, context);
        }
    },
};
