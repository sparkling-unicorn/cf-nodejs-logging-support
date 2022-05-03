import LevelUtils from "../logger/level-utils";
import RecordFactory from "../logger/record-factory";
import ResponseAccesor from "./response-accessor";
import RootLogger from "../logger/root-logger";

interface IMiddleware {
    //logNetwork: (req: any, res: any, next?: any) => void
}

export default class Middleware implements IMiddleware {

    constructor() {
    }

    static logNetwork(_req: any, _res: any, next?: any) {
        let logSent = false;

        const networkLogger = RootLogger.getInstance().createLogger();
        networkLogger.initContext(_req);
        _req.logger = networkLogger;

        const finishLog = () => {

            if (!logSent) {
                const record = RecordFactory.buildReqRecord(_req, _res);
                const level = LevelUtils.getLevel(record.level);
                const loggingLevelThreshold = LevelUtils.getLevel(_req.logger.getLoggingLevel());
                if (LevelUtils.isLevelEnabled(loggingLevelThreshold, level)) {
                    const res = ResponseAccesor.getInstance();
                    res.finishLog(record);
                }
                logSent = true;
            }
        }

        _res.on("finish", finishLog);

        _res.on("header", finishLog);

        next ? next() : null;
    }
}
