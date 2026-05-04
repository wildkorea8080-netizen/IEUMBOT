__all__ = ["run_pre_answer_policy_hook", "run_final_chat_pipeline"]


def __getattr__(name: str):
    if name == "run_final_chat_pipeline":
        from app.services.chat.final_chat_pipeline_service import run_final_chat_pipeline

        return run_final_chat_pipeline
    if name == "run_pre_answer_policy_hook":
        from app.services.chat.pre_answer_pipeline_service import run_pre_answer_policy_hook

        return run_pre_answer_policy_hook
    raise AttributeError(name)
