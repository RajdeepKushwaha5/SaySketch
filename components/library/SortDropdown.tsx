"use client";

import { useEffect, useRef, useState } from "react";
import {
  IconChevronDown,
  IconArrowUp,
  IconArrowDown,
} from "@tabler/icons-react";
import type { SortField, SortDirection } from "@/types/library";

interface Props {
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField, dir: SortDirection) => void;
}

const SORT_OPTIONS: { field: SortField; label: string }[] = [
  { field: "updatedAt", label: "Updated" },
  { field: "createdAt", label: "Created" },
  { field: "lastOpenedAt", label: "Opened" },
  { field: "name", label: "Name" },
  { field: "diagramType", label: "Type" },
  { field: "elementCount", label: "Elements" },
];

const FIELD_LABELS: Record<SortField, string> = {
  updatedAt: "Updated",
  createdAt: "Created",
  lastOpenedAt: "Opened",
  name: "Name",
  diagramType: "Type",
  elementCount: "Elements",
};

export default function SortDropdown({
  sortField,
  sortDirection,
  onSort,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function handleSelect(field: SortField) {
    if (field === sortField) {
      onSort(field, sortDirection === "asc" ? "desc" : "asc");
    } else {
      onSort(field, "desc");
    }
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="ctl px-3 py-2 text-sm"
      >
        <span>{FIELD_LABELS[sortField]}</span>
        {sortDirection === "asc" ? (
          <IconArrowUp size={12} className="text-placeholder" />
        ) : (
          <IconArrowDown size={12} className="text-placeholder" />
        )}
        <IconChevronDown size={12} className="text-placeholder" />
      </button>

      {open && (
        <div className="pop absolute right-0 top-full mt-2 z-50 w-48">
          <p className="pop-label">Sort by</p>
          {SORT_OPTIONS.map(({ field, label }) => {
            const isActive = field === sortField;
            return (
              <button
                key={field}
                onClick={() => handleSelect(field)}
                className={`pop-item justify-between ${isActive ? "is-active" : ""}`}
              >
                <span>{label}</span>
                {isActive &&
                  (sortDirection === "asc" ? (
                    <IconArrowUp size={14} />
                  ) : (
                    <IconArrowDown size={14} />
                  ))}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
