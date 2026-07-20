import { apiClient } from "./index";

export type ProductInquiryStatus = "new" | "contacted" | "converted" | "closed";

export type ProductInquiryInput = {
  organizationName: string;
  contactName: string;
  email: string;
  phone: string;
  interest?: string | null;
  message?: string | null;
  source?: string | null;
};

export type ProductInquiryItem = {
  id: string;
  organizationName: string;
  contactName: string;
  email: string;
  phone: string;
  interest: string | null;
  message: string | null;
  status: ProductInquiryStatus;
  handledNote: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductInquiryListResult = {
  items: ProductInquiryItem[];
  total: number;
};

/** 공개 도입 문의 접수. */
export async function submitInquiry(
  input: ProductInquiryInput,
): Promise<{ id: string; status: string }> {
  return apiClient.request<{ id: string; status: string }>("/public/inquiries", {
    method: "POST",
    body: input,
  });
}

/** (슈퍼관리자) 문의 목록. */
export async function getInquiries(status?: string): Promise<ProductInquiryListResult> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiClient.request<ProductInquiryListResult>(`/super-admin/inquiries${query}`);
}

/** (슈퍼관리자) 문의 상태/메모 갱신. */
export async function updateInquiry(
  id: string,
  body: { status?: ProductInquiryStatus; handledNote?: string },
): Promise<ProductInquiryItem> {
  return apiClient.request<ProductInquiryItem>(`/super-admin/inquiries/${id}`, {
    method: "PATCH",
    body,
  });
}
