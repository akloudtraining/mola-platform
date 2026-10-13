"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function nodeText(node: React.ReactNode): string {
  return React.Children.toArray(node).map((child) => {
    if (typeof child === "string" || typeof child === "number") return String(child)
    if (React.isValidElement<{ children?: React.ReactNode }>(child)) return nodeText(child.props.children)
    return ""
  }).join(" ").replace(/\s+/g, " ").trim()
}

function headerLabels(children: React.ReactNode): string[] {
  const labels: string[] = []
  const visit = (nodes: React.ReactNode) => React.Children.forEach(nodes, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return
    if (child.type === TableHead) {
      labels.push(nodeText(child.props.children))
      return
    }
    visit(child.props.children)
  })
  visit(children)
  return labels
}

function labelBodyCells(children: React.ReactNode, labels: string[]): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) return child
    if (child.type !== TableBody) return child

    const rows = React.Children.map(child.props.children, (row) => {
      if (!React.isValidElement<{ children?: React.ReactNode }>(row) || row.type !== TableRow) return row
      let column = 0
      const cells = React.Children.map(row.props.children, (cell) => {
        if (!React.isValidElement(cell) || cell.type !== TableCell) return cell
        const label = labels[column++] || ""
        return React.cloneElement(cell as React.ReactElement<Record<string, unknown>>, { "data-label": label })
      })
      return React.cloneElement(row as React.ReactElement<{ children?: React.ReactNode }>, { children: cells })
    })

    return React.cloneElement(child as React.ReactElement<{ children?: React.ReactNode }>, { children: rows })
  })
}

function Table({ className, children, ...props }: React.ComponentProps<"table">) {
  const labels = headerLabels(children)
  const labeledChildren = labelBodyCells(children, labels)
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
        children={labeledChildren}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
