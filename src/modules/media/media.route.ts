import { Router, type NextFunction, type Request, type Response } from "express";
import { Types } from "mongoose";
import { ApiResponseDto } from "../../dto/apiResponse.dto";
import { findPublicFile, openPublicDownload } from "../../buckets/publicBucket";

const router = Router();

router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    if (!id || !Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid file id",
        data: null,
      } satisfies ApiResponseDto);
    }

    const file = await findPublicFile(id);
    if (!file) {
      return res.status(404).json({
        success: false,
        message: "File not found",
        data: null,
      } satisfies ApiResponseDto);
    }

    const contentType =
      (typeof file.metadata?.contentType === "string"
        ? file.metadata.contentType
        : undefined) ?? "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    openPublicDownload(id)
      .on("error", next)
      .pipe(res);
  } catch (error) {
    next(error);
  }
});

export default router;
