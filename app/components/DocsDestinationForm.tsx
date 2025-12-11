"use client";

import { useEffect, useMemo, useState } from "react";
import { TreeSelect } from "antd";
import type { DataNode } from "antd/es/tree";
import { Input } from "@/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { sanitizeSlug, type DirNode } from "@/lib/submission";
import {
  CREATE_SUBDIR_SUFFIX,
  toTreeSelectData,
} from "@/app/components/contribute/tree-utils";

interface DocsDestinationFormProps {
  onChange?: (path: string) => void;
}

export function DocsDestinationForm({ onChange }: DocsDestinationFormProps) {
  const [tree, setTree] = useState<DirNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [newSub, setNewSub] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/docs-tree", { cache: "no-store" });
        const data = await res.json();
        if (mounted && data?.ok) {
          setTree(data.tree || []);
        }
      } catch {
        const res = await fetch("/docs-tree.json").catch(() => null);
        const data = await res?.json();
        if (mounted && data?.ok) {
          setTree(data.tree || []);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const options = useMemo(() => toTreeSelectData(tree), [tree]);
  const sanitizedSubdir = useMemo(() => sanitizeSlug(newSub), [newSub]);

  const finalDirPath = useMemo(() => {
    if (!selectedKey) return "";
    if (!selectedKey.endsWith(CREATE_SUBDIR_SUFFIX)) return selectedKey;
    const [l1] = selectedKey.split("/");
    if (!l1) return "";
    if (!sanitizedSubdir) return "";
    return `${l1}/${sanitizedSubdir}`;
  }, [selectedKey, sanitizedSubdir]);

  useEffect(() => {
    onChange?.(finalDirPath);
  }, [finalDirPath, onChange]);

  const needsSubdirName = selectedKey.endsWith(CREATE_SUBDIR_SUFFIX);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">投稿目录</h2>
        <p className="text-sm text-muted-foreground">
          选择稿件要放置的栏目，可在一级目录下新建二级栏目。
        </p>
      </div>

      <div className="space-y-2">
        <Label>选择栏目</Label>
        <TreeSelect
          className="w-full"
          treeData={options as DataNode[]}
          loading={loading}
          value={selectedKey || undefined}
          onChange={(val) => setSelectedKey((val as string) ?? "")}
          showSearch
          treeNodeFilterProp="label"
          filterTreeNode={(input, node) =>
            String(node.label ?? "")
              .toLowerCase()
              .includes(input.toLowerCase())
          }
          treeExpandedKeys={expandedKeys}
          onTreeExpand={(keys) => setExpandedKeys(keys as string[])}
          treeExpandAction="click"
          placeholder="请选择（可搜索）"
          allowClear
          treeLine
          listHeight={360}
          popupMatchSelectWidth={false}
          getPopupContainer={(trigger) =>
            trigger?.parentElement ?? document.body
          }
        />
      </div>

      {needsSubdirName && (
        <div className="space-y-2">
          <Label>新建二级子栏目名称</Label>
          <Input
            placeholder="e.g. foundation-models"
            value={newSub}
            onChange={(e) => setNewSub(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            将创建路径：{selectedKey.split("/")[0]} /{" "}
            {sanitizedSubdir || "<未填写或格式不合法>"}
          </p>
          {newSub && !sanitizedSubdir && (
            <p className="text-xs text-destructive">
              仅支持英文、数字、连字符或下划线，且需以字母或数字开头。
            </p>
          )}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        路径预览：
        <code className="ml-1 font-mono">{finalDirPath || "(未选择)"}</code>
      </div>
    </div>
  );
}
