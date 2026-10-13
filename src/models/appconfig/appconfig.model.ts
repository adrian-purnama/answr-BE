import { model, Schema, Types } from "mongoose";
import { AppConfigInterface } from "./appconfig.interface";

const appConfigSchema = new Schema<AppConfigInterface>({
    appName: {
        type: String,
        required: true,
    },

    openLogin: {
        type: Boolean,
        required: true,
    },

    openRegister: {
        type: Boolean,
        required: true,
    },

    appLogo: {
        type: Types.ObjectId,
        required: false,
    },
});

export const AppConfigModel = model<AppConfigInterface>("AppConfig", appConfigSchema)