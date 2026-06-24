export type FullCountItemActionId = "preserve" | "zero" | "delete";

export type FullCountItemAction = {
  id: FullCountItemActionId;
  label: string;
  description: string;
  destructive?: boolean;
};

export const fullCountItemActions: FullCountItemAction[] = [
  {
    id: "preserve",
    label: "Bỏ qua, giữ tồn hiện tại",
    description: "Xóa dòng OCR khỏi phiếu và không reset món này về 0.",
  },
  {
    id: "zero",
    label: "Không có hàng, set 0",
    description: "Giữ món trong phiếu với tồn kho bằng 0.",
    destructive: true,
  },
  {
    id: "delete",
    label: "Xóa khỏi phiếu",
    description: "Xóa dòng này khỏi phiếu, không đánh dấu giữ tồn.",
    destructive: true,
  },
];
