"use client";

import { useEffect, useState } from "react";

import {
  ADMIN_SELECTED_CHATBOT_EVENT,
  readSelectedAdminChatbot,
  type SelectedAdminChatbot,
} from "./selected-chatbot";

/**
 * 사이드바 좌측 상단 '현재 챗봇' 전역 선택을 구독한다.
 * 드롭다운에서 챗봇을 바꾸면(같은 탭: CustomEvent, 다른 탭: storage) 재렌더된다.
 *
 * 각 페이지는 이 값(selected?.id)만 보고 데이터를 로드하면 되므로,
 * 메뉴마다 별도의 챗봇 선택기를 둘 필요가 없다.
 *
 * SSR/hydration 안전: 초기값은 null, 마운트 후 useEffect에서 실제 값으로 채운다.
 */
export function useSelectedChatbot(): SelectedAdminChatbot | null {
  const [selected, setSelected] = useState<SelectedAdminChatbot | null>(null);

  useEffect(() => {
    const sync = () => setSelected(readSelectedAdminChatbot());
    sync();
    window.addEventListener(ADMIN_SELECTED_CHATBOT_EVENT, sync as EventListener);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ADMIN_SELECTED_CHATBOT_EVENT, sync as EventListener);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return selected;
}
