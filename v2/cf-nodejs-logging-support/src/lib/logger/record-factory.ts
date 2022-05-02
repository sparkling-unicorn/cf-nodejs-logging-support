import util from "util";
import Config from "../config/config";
import { ConfigField } from "../config/interfaces";
import RequestAccesor from "../middleware/request-accesor";
import ResponseAccesor from "../middleware/response-accessor";
import ReqContext from "./context";

export default class RecordFactory {

    // init a new record and assign fields with output "msg-log"
    static buildMsgRecord(_args: Array<any>, _context?: ReqContext): any {

        // Assign fields with output "msg-log"
        const msgLogFields = Config.getInstance().getMsgFields();
        let record: any = {
            "level": "info",
        };

        msgLogFields.forEach(field => {
            if (!Array.isArray(field.source)) {
                switch (field.source.type) {
                    case "req-header":
                            record[field.name] = _context?.getProp(field.name as string);
                        break;
                    case "req-object":
                            record[field.name] = _context?.getProp(field.name as string);
                        break;
                }
            } else {

                // TO DO: handle sources as array case
            }

        });
        record["msg"] = util.format.apply(util, _args);
        // TO DO: check if Stacktrace
        return record;
    }

    // init a new req log object and assign fields with output "req-log"
    static buildReqRecord(_req: any, _res: any): any {

        const requestAccesor = RequestAccesor.getInstance();
        const responseAccesor = ResponseAccesor.getInstance();

        // Assign fields with output "req-log"
        const reqLogFields = Config.getInstance().getReqFields();
        let record: any = { "level": "info" };
        // TO DO: handle envVar case
        reqLogFields.forEach(field => {
            if (!Array.isArray(field.source)) {
                switch (field.source.type) {
                    case "req-header":
                        record[field.name] = requestAccesor.getHeaderField(_req, field.source.name as string);
                        break;
                    case "req-object":
                        record[field.name] = requestAccesor.getField(_req, field.source.name as string);
                        break;
                    case "res-header":
                        record[field.name] = responseAccesor.getHeaderField(_res, field.source.name as string);
                        break;
                    case "res-object":
                        record[field.name] = responseAccesor.getField(_res, field.source.name as string);
                        break;
                }
            }

            // TO DO: sources as array case

        });
        return record;
    }

    private static assignFields(fields: ConfigField[], context?: ReqContext): any {
        let record: any = {
            "level": "info",
        };

        fields.forEach(field => {
            if (!Array.isArray(field.source)) {
                switch (field.source.type) {
                    case "req-header":
                        if (context) {
                            record[field.name] = context.getProp(field.name as string);
                        }
                        break;
                    case "req-object":
                        if (context) {
                            record[field.name] = context.getProp(field.name as string);
                        }
                        break;
                    case "res-header":
                        // ignore
                        break;
                    case "res-object":
                        // ignore
                        break;
                }
            } else {

                // TO DO: handle sources as array case
            }

        });

        return record
    }
}
