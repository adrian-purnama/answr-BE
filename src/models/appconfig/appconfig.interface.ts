import { Types } from "mongoose";

export interface AppConfigInterface {
    appName?: string;
    openLogin?: boolean;
    openRegister?: boolean;
    appLogo?: Types.ObjectId;
}