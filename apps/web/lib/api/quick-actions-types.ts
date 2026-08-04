export type MenuActionType = "category" | "question" | "link";

export type MenuNode = {
  id: string;
  label: string;
  description: string | null;
  actionType: MenuActionType;
  payload: string | null;
  url: string | null;
  sortOrder: number;
  isEnabled: boolean;
  children: MenuNode[];
};

export type MenuNodeCreateInput = {
  chatbotId: string;
  label: string;
  actionType: MenuActionType;
  parentId?: string | null;
  description?: string | null;
  payload?: string | null;
  url?: string | null;
  sortOrder?: number;
};

export type MenuNodeUpdateInput = {
  chatbotId: string;
  label?: string;
  description?: string | null;
  payload?: string | null;
  url?: string | null;
  sortOrder?: number;
  isEnabled?: boolean;
};
