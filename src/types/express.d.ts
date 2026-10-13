import { HydratedDocument, Types } from "mongoose";
import { UserInterface } from "../models/user/user.interface";
import { LiveAgentInterface } from "../models/liveAgent/liveAgent.interface";
import type { CollaboratorPermissions } from "../models/apiKeyCollaborator/apiKeyCollaborator.interface";

declare global {
    namespace Express {
        interface Request {
            user?: HydratedDocument<UserInterface>
            liveAgent?: HydratedDocument<LiveAgentInterface>
            apiKeyAuth?: {
                apiKeyId: Types.ObjectId;
                userId: Types.ObjectId;
            };
            apiKeyAccess?: {
                apiKey: {
                    id: string;
                    userId: Types.ObjectId;
                    label: string;
                };
                role: "owner" | "collaborator";
                permissions: CollaboratorPermissions;
            };
        }
    }
}