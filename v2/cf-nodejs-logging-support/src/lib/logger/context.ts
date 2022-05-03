import Config from "../config/config";
import NestedVarResolver from "../helper/nested-var-resolver";
import RequestAccesor from "../middleware/request-accesor";

export default class ReqContext {
    private fields: any = {};
    private requestAccesor = RequestAccesor.getInstance();

    constructor(_req: any) {
        this.setFields(_req);
    }

    getProp(key: string) {
        return this.fields[key];
    }

    private setFields(_req: any) {
        const fields = Config.getInstance().getFields();
        const contextFields = fields.filter(field => {
            if (field.output?.includes("msg-log") && field.output?.includes("req-log")) {
                return true;
            }
            if (field.context == true) {
                return true;
            }
            return false;
        });

        // TO DO: handle envVar case
        contextFields.forEach(field => {
            if (!Array.isArray(field.source)) {
                switch (field.source.type) {
                    case "req-header":
                        this.fields[field.name] = this.requestAccesor.getHeaderField(_req, field.source.name as string);
                        break;
                    case "req-object":
                        this.fields[field.name] = this.requestAccesor.getField(_req, field.source.name as string);
                        break;
                    case "env":
                        if (field.source.path) {
                            this.fields[field.name] = NestedVarResolver.resolveNestedVariable(process.env, field.source.path);
                            break;
                        }
                        this.fields[field.name] = process.env[field.source.name!];
                        break;
                    case "static":
                        this.fields[field.name] = field.source.value;
                        break;
                    case "env":
                        if (field.source.path) {
                            this.fields[field.name] = NestedVarResolver.resolveNestedVariable(process.env, field.source.path);
                            break;
                        }
                        this.fields[field.name] = process.env[field.source.name!];
                        break;
                }
            }

            // TO DO: sources as array case

        });
    }
}
