"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import {
  BarChart3,
  ChevronsUpDown,
  FilePlus2,
  Globe,
  Handshake,
  ImagePlus,
  LayoutList,
  Link2,
  Mic,
  TextSearch,
  Users,
} from "lucide-react";
import { markdownToProse, proseToMarkdown, type ProseNode } from "@/lib/wiki/prose";
import { WikiCircleContext } from "@/components/wiki/poll-block";
import { NewPollDialog } from "@/components/polls/new-poll-dialog";
import { AddProposalDialog } from "@/components/proposals/add-proposal-dialog";
import { proposalDirective as proposalLine } from "@/lib/proposals/shared";
import { AddDocumentDialog } from "@/components/wiki/add-document-dialog";
import { EmbedPageDialog } from "@/components/wiki/embed-page-dialog";
import { featureEnabled } from "@/lib/circles/features";
import { uploadWikiImage } from "@/lib/image-client";
import { useToast } from "@/components/ui/use-toast";
import { useCircles } from "@/components/directory/use-directory";
import { wikiExtensions } from "@/components/wiki/editor-schema";
import { WikiMention, type MentionParams } from "@/components/wiki/mention-menu";
import { SlashMenu, slashItems, type SlashItem } from "@/components/wiki/slash-menu";
import { captureCursor, restoreCursor } from "@/components/wiki/editor-cursor";
import { EditorContextMenu } from "@/components/wiki/editor-context-menu";
import { LinkWordsDialog } from "@/components/wiki/link-words-dialog";
import { FindBar } from "@/components/wiki/find-bar";
import {
  HighlightMenu,
  HighlightTools,
  ImageDialog,
  InsertTableButton,
  LinkDialog,
  ListButtons,
  MarkButtons,
  StyleMenu,
  TableTools,
  ToolbarButton,
  ToolbarMenu,
  ToolbarSeparator,
  UndoRedo,
} from "@/components/wiki/editor-toolbar";

export interface RichEditorHandle {
  /** Replace the text (e.g. restoring a saved draft). */
  setMarkdown: (markdown: string) => void;
  /** Replace the text with a merged version, keeping the cursor in its block (`mineAt` maps old blocks to new). */
  replace: (markdown: string, mineAt: number[] | null) => void;
  focus: () => void;
}

/** Markdown as the blocks (or, for a link, the inline nodes) to put in the editor. */
const blocksOf = (markdown: string) => markdownToProse(markdown).content ?? [];
const inlineOf = (markdown: string): ProseNode[] => blocksOf(markdown)[0]?.content ?? [];

/** Put in a link where the cursor is, with a space before it unless there's one already. */
export function insertLinkAtCursor(editor: Editor, link: string) {
  const { from } = editor.state.selection;
  const before = from > 1 ? editor.state.doc.textBetween(from - 1, from, " ", " ") : "";
  const nodes = inlineOf(link);
  editor
    .chain()
    .focus()
    .insertContent([
      ...(before && !/\s/.test(before) ? [{ type: "text", text: " " }] : []),
      ...nodes,
    ])
    .run();
}

type LinkChoice = "web" | "page" | "upload";

/**
 * The toolbar's one **Link** menu: a web address (the link box, for the
 * selected words), a page or document already here (linked — or a page
 * shown in this one), or a new file, uploaded to the circle's documents and
 * linked.
 */
function LinkMenu({
  canUpload,
  onWeb,
  onPage,
  onUpload,
}: {
  canUpload: boolean;
  onWeb: () => void;
  onPage: () => void;
  onUpload: () => void;
}) {
  const choice = (value: LinkChoice, Icon: typeof Globe, text: string) => ({
    value,
    name: text.replace("…", ""),
    label: (
      <span className="flex items-center gap-2 whitespace-nowrap" data-link-choice={value}>
        <Icon className="h-4 w-4 shrink-0" aria-hidden /> {text}
      </span>
    ),
  });
  return (
    <ToolbarMenu<LinkChoice>
      title="Link"
      trigger={<Link2 className="h-4 w-4" />}
      options={[
        choice("web", Globe, "Web address…"),
        choice("page", LayoutList, "A page or document…"),
        ...(canUpload ? [choice("upload", FilePlus2, "Upload a file…")] : []),
      ]}
      onChoose={(value) => (value === "web" ? onWeb() : value === "page" ? onPage() : onUpload())}
    />
  );
}

/** The toolbar's transcript toggle: adds the transcript at the page's end (recording), or removes it. */
function TranscriptToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <span data-transcript-toggle={on ? "on" : "off"} className="inline-flex">
      <ToolbarButton
        title={on ? "Remove the transcript" : "Record a transcript"}
        active={on}
        onClick={onToggle}
      >
        <Mic className="h-4 w-4" />
      </ToolbarButton>
    </span>
  );
}

/**
 * The wiki's visual editor (TipTap): a simple formatting toolbar (with a
 * highlighter), a right-click menu (`editor-context-menu.tsx`), lists,
 * tables, photos, collapsible sections, polls, and Markdown shortcuts as you
 * type (`#`, `-`, `**`), and find and replace (`find-bar.tsx`, Ctrl/⌘+F).
 * Typing / offers what to put in (`slash-menu.tsx`);
 * typing @ links a page or a document — or a new page. The page stays Markdown (`lib/wiki/prose.ts` converts both ways);
 * what the editor can't show is kept as written, and if a page can't be
 * opened here at all, `onError` sends it to the plain-text editor.
 */
export const RichEditor = forwardRef<
  RichEditorHandle,
  {
    markdown: string;
    /** The circle that keeps the page. */
    circleId: string;
    circleName: string;
    pageId: string;
    /** The page's address (for its photos and polls). */
    pageSlug: string;
    /** Its title, and whether it's a meeting's notes (for a proposal added to it). */
    pageTitle: string;
    meetingNotes: boolean;
    onChange: (markdown: string) => void;
    onError: () => void;
    /** A new page was linked with @: it's made when this page is saved. */
    onCreatePage: (title: string) => void;
    /** The same handle as the ref (refs don't pass through a lazily loaded component). */
    control?: MutableRefObject<RichEditorHandle | null>;
    /** The toolbar's transcript toggle: add the transcript at the page's end (recording), or remove it. */
    onTranscribe?: () => void;
    /** The page has its transcript (the toggle shows on). */
    transcribing?: boolean;
    /** The toolbar's **Who's present**: choose the people present (meeting notes). */
    onPresent?: () => void;
  }
>(function RichEditor(
  {
    markdown,
    circleId,
    circleName,
    pageId,
    pageSlug,
    pageTitle,
    meetingNotes,
    onChange,
    onError,
    onCreatePage,
    control,
    onTranscribe,
    transcribing = false,
    onPresent,
  },
  ref
) {
  const { toast } = useToast();
  const host = useRef<HTMLDivElement>(null);
  const [linking, setLinking] = useState(false);
  const [linkingWords, setLinkingWords] = useState(false);
  const [imaging, setImaging] = useState(false);
  const [polling, setPolling] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [addingDocument, setAddingDocument] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  // Documents go into the circle's documents, so only while it has them turned on.
  const documentsOn = featureEnabled(
    useCircles()?.find((circle) => circle.id === circleId),
    "documents"
  );
  const wiki = useMemo(
    () => ({ circleId, circleName, pageSlug }),
    [circleId, circleName, pageSlug]
  );
  // The editor is set up once, so it reaches the latest props through refs.
  const latest = useRef({ onChange, onError, onCreatePage, pageSlug });
  latest.current = { onChange, onError, onCreatePage, pageSlug };
  const mention = useRef<MentionParams>({
    circleId,
    circleName,
    pageId,
    onCreatePage,
    canCreate: true,
  });
  mention.current = {
    circleId,
    circleName,
    pageId,
    onCreatePage: (title) => latest.current.onCreatePage(title),
    canCreate: true,
  };
  // The / menu's items.
  const canUpload = documentsOn;
  const slash = useRef<SlashItem[]>([]);
  slash.current = slashItems({
    onImage: () => setImaging(true),
    onPage: () => setEmbedding(true),
    onPoll: () => setPolling(true),
    onProposal: () => setProposing(true),
    onPresent: () => onPresent?.(),
    ...(canUpload ? { onUpload: () => setAddingDocument(true) } : {}),
  });
  // Photos chosen from the toolbar, pasted, or dropped in go to the page's photos.
  const uploadPhoto = async (file: File) => {
    try {
      return await uploadWikiImage(latest.current.pageSlug, file);
    } catch (error) {
      toast({
        title: "Could not add the photo",
        description: (error as Error).message,
        variant: "destructive",
      });
      throw error;
    }
  };
  const upload = useRef(uploadPhoto);
  upload.current = uploadPhoto;

  // The page as the editor's document, once (later text comes through the handle).
  const initial = useMemo(() => {
    try {
      return markdownToProse(markdown);
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!initial) latest.current.onError();
  }, [initial]);
  // What the page says now, as the editor writes it: only a real change is reported (not, say,
  // the empty line the editor keeps below a table, or a click that changes nothing).
  const said = useRef<string | null>(null);
  if (said.current === null)
    said.current = (initial ? proseToMarkdown(initial) : markdown).trimEnd();
  const report = (value: string) => {
    if (value.trimEnd() === said.current) return;
    said.current = value.trimEnd();
    latest.current.onChange(value);
  };
  const reportRef = useRef(report);
  reportRef.current = report;

  // The find bar: whether it shows Replace, and a count of times it was asked for (to focus it).
  const [finding, setFinding] = useState<{ replacing: boolean; opened: number } | null>(null);
  const openFind = (replacing: boolean) =>
    setFinding((was) => ({
      replacing: replacing || !!was?.replacing,
      opened: (was?.opened ?? 0) + 1,
    }));

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      ...wikiExtensions({
        placeholder:
          "Start writing — type / for headings, lists, tables and more, or @ to link a page…",
        onLinkShortcut: () => setLinking(true),
        uploadImage: (file) => upload.current(file),
        onFind: openFind,
      }),
      WikiMention(() => mention.current),
      SlashMenu(() => slash.current),
    ],
    content: initial ?? undefined,
    enableContentCheck: true,
    onContentError: () => latest.current.onError(),
    editorProps: { attributes: { class: "wiki-prose document-body", spellcheck: "true" } },
    onUpdate: ({ editor: current }) =>
      reportRef.current(proseToMarkdown(current.getJSON() as ProseNode)),
  });

  const handle: RichEditorHandle = {
    setMarkdown: (value) => {
      said.current = value.trimEnd();
      editor
        ?.chain()
        .setMeta("addToHistory", false)
        .setContent(markdownToProse(value), { emitUpdate: false })
        .run();
    },
    replace: (value, mineAt) => {
      said.current = value.trimEnd();
      if (!editor) return;
      const mark = editor.isFocused ? captureCursor(editor) : null;
      editor
        .chain()
        .setMeta("addToHistory", false)
        .setContent(markdownToProse(value), { emitUpdate: false })
        .run();
      if (mark) restoreCursor(editor, mark, mineAt);
    },
    focus: () => editor?.commands.focus(),
  };
  useImperativeHandle(ref, () => handle);
  if (control) control.current = handle;

  /** Put whole blocks (from Markdown) in where the cursor is. */
  const insertBlocks = (text: string) =>
    editor?.chain().focus().insertContent(blocksOf(text)).run();

  return (
    <WikiCircleContext.Provider value={wiki}>
      <div className="wiki-editor">
        {editor ? (
          <Toolbar
            editor={editor}
            canUpload={canUpload}
            transcribing={transcribing}
            onLink={() => setLinking(true)}
            onPage={() => setEmbedding(true)}
            onUpload={() => setAddingDocument(true)}
            onImage={() => setImaging(true)}
            onPoll={() => setPolling(true)}
            onProposal={() => setProposing(true)}
            onPresent={() => onPresent?.()}
            onTranscribe={() => onTranscribe?.()}
            finding={!!finding}
            onFind={() => (finding ? setFinding(null) : openFind(false))}
          >
            {finding ? (
              <FindBar
                editor={editor}
                replacing={finding.replacing}
                opened={finding.opened}
                onClose={() => setFinding(null)}
              />
            ) : null}
          </Toolbar>
        ) : (
          <div className="wiki-toolbar h-11" />
        )}
        <div ref={host} className="relative">
          <EditorContent editor={editor} />
          {editor ? <HighlightTools editor={editor} host={host} /> : null}
        </div>
        {editor ? (
          <EditorContextMenu
            editor={editor}
            onLink={() => setLinking(true)}
            onLinkPage={() => setLinkingWords(true)}
          />
        ) : null}
      </div>
      {editor && linking ? <LinkDialog editor={editor} onClose={() => setLinking(false)} /> : null}
      {editor && linkingWords ? (
        <LinkWordsDialog
          editor={editor}
          circle={{ id: circleId, name: circleName }}
          pageId={pageId}
          canCreate
          onCreatePage={onCreatePage}
          onClose={() => setLinkingWords(false)}
        />
      ) : null}
      {editor && imaging ? (
        <ImageDialog editor={editor} upload={uploadPhoto} onClose={() => setImaging(false)} />
      ) : null}
      {editor && addingDocument ? (
        <AddDocumentDialog
          circle={{ id: circleId, name: circleName }}
          onClose={() => setAddingDocument(false)}
          onAdded={(link) => {
            setAddingDocument(false);
            insertLinkAtCursor(editor, link);
          }}
        />
      ) : null}
      {editor && embedding ? (
        <EmbedPageDialog
          circle={{ id: circleId, name: circleName }}
          pageId={pageId}
          onClose={() => setEmbedding(false)}
          onChosen={(text, kind) => {
            setEmbedding(false);
            if (kind === "link") insertLinkAtCursor(editor, text);
            else insertBlocks(text);
          }}
        />
      ) : null}
      {proposing ? (
        <AddProposalDialog
          circleId={circleId}
          circleName={circleName}
          page={{ id: pageId, title: pageTitle, meeting: meetingNotes }}
          onClose={() => setProposing(false)}
          onChosen={(id) => {
            setProposing(false);
            insertBlocks(proposalLine(id));
          }}
        />
      ) : null}
      {polling ? (
        <NewPollDialog
          circle={{ id: circleId, name: circleName }}
          pageSlug={pageSlug}
          onClose={() => setPolling(false)}
          onCreated={(poll) => {
            setPolling(false);
            insertBlocks(`::poll{id="${poll.id}"}`);
          }}
        />
      ) : null}
    </WikiCircleContext.Provider>
  );
});

function Toolbar({
  editor,
  canUpload,
  transcribing,
  onLink,
  onPage,
  onUpload,
  onImage,
  onPoll,
  onProposal,
  onPresent,
  onTranscribe,
  finding,
  onFind,
  children,
}: {
  editor: Editor;
  canUpload: boolean;
  transcribing: boolean;
  onLink: () => void;
  onPage: () => void;
  onUpload: () => void;
  onImage: () => void;
  onPoll: () => void;
  onProposal: () => void;
  onPresent: () => void;
  onTranscribe: () => void;
  finding: boolean;
  onFind: () => void;
  /** The find bar, a row of its own under the buttons. */
  children?: React.ReactNode;
}) {
  // Re-render the toolbar's state (bold, the style…) as the cursor moves.
  useEditorState({ editor, selector: ({ transactionNumber }) => transactionNumber });
  return (
    <div
      className="wiki-toolbar flex flex-wrap items-center gap-0.5 px-2 py-1.5"
      role="toolbar"
      aria-label="Formatting"
    >
      <UndoRedo editor={editor} />
      <ToolbarButton title="Find and replace (Ctrl+F)" active={finding} onClick={onFind}>
        <TextSearch className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarSeparator />
      <StyleMenu editor={editor} />
      <MarkButtons editor={editor} />
      <HighlightMenu editor={editor} />
      <ToolbarSeparator />
      <ListButtons editor={editor} />
      <ToolbarSeparator />
      <LinkMenu canUpload={canUpload} onWeb={onLink} onPage={onPage} onUpload={onUpload} />
      <ToolbarSeparator />
      <ToolbarButton title="Insert image" onClick={onImage}>
        <ImagePlus className="h-4 w-4" />
      </ToolbarButton>
      <InsertTableButton editor={editor} />
      <ToolbarButton
        title="Collapsible section"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertContent({
              type: "details",
              attrs: { title: "Details" },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "What this section hides." }],
                },
              ],
            })
            .run()
        }
      >
        <ChevronsUpDown className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Add a poll" onClick={onPoll}>
        <BarChart3 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton title="Add a proposal" onClick={onProposal}>
        <Handshake className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarSeparator />
      <ToolbarButton title="Who's present" onClick={onPresent}>
        <Users className="h-4 w-4" />
      </ToolbarButton>
      <TranscriptToggle on={transcribing} onToggle={onTranscribe} />
      <TableTools editor={editor} />
      {children}
    </div>
  );
}
