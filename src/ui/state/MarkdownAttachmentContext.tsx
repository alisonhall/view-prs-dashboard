import { createContext, useContext } from 'react';
import type { MarkdownAttachmentSource } from '../helpers/pr-markdown-render.helpers.ts';

/**
 * The PR the detail pane shows, for rendering its description's and
 * comments' GitHub attachments (pr-markdown-render.helpers.ts fetches them
 * through the server with it). Provided by PrDetailPane; without it, an
 * attachment image shows as "[image unavailable]".
 */
export const MarkdownAttachmentContext = createContext<MarkdownAttachmentSource | undefined>(undefined);

export const useMarkdownAttachmentSource = () => useContext(MarkdownAttachmentContext);
