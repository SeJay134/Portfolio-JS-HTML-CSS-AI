import { createSeoPreviewHandler } from "../server/blogSeoPreview";

export default {
  fetch(request: Request) {
    return createSeoPreviewHandler({ env: process.env })(request);
  },
};
