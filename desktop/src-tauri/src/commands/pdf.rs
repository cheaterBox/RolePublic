use crate::{ai, AppState};
use std::fmt::Arguments;
use std::path::PathBuf;
use tauri::{command, AppHandle, Manager, State};
use tectonic::status::MessageKind;
use tectonic::status::StatusBackend;

pub struct CapturingStatusBackend {
    pub logs: String,
}

impl CapturingStatusBackend {
    pub fn new() -> Self {
        Self {
            logs: String::new(),
        }
    }
}

impl Default for CapturingStatusBackend {
    fn default() -> Self {
        Self::new()
    }
}

impl StatusBackend for CapturingStatusBackend {
    fn report(&mut self, kind: MessageKind, args: Arguments, err: Option<&anyhow::Error>) {
        let prefix = match kind {
            MessageKind::Error => "error: ",
            MessageKind::Warning => "warning: ",
            MessageKind::Note => "note: ",
        };
        let msg = format!("{}", args);
        self.logs.push_str(prefix);
        self.logs.push_str(&msg);

        if let Some(e) = err {
            self.logs.push_str(&format!(" (error detail: {})", e));
            // Also push to stdout for tauri dev logs
            eprintln!("Tectonic Error: {} - Detail: {}", msg, e);
        } else if kind == MessageKind::Error {
            eprintln!("Tectonic Error: {}", msg);
        }

        self.logs.push('\n');
    }

    fn dump_error_logs(&mut self, logs: &[u8]) {
        if let Ok(s) = std::str::from_utf8(logs) {
            self.logs.push_str("--- Underlying Error Logs ---\n");
            self.logs.push_str(s);
            self.logs.push('\n');
        }
    }
}

pub const TECTONIC_LATEX_CRATE_RULES: &str = r#"
CRITICAL COMPILATION ENGINE & CRATE LIMITATIONS (TECTONIC CRATE v0.17.0):
You MUST perform a deep-level awareness of the Rust `tectonic` crate version 0.17.0 (derived from XeTeX).
The application compiles documents using the embedded Rust `tectonic` crate (v0.17.0) with `ProcessingSessionBuilder` and the default online/cached TeXLive bundle. It is NOT a full command-line TeX Live system. It has strict functional limitations:

1. ABSOLUTELY NO SHELL ESCAPE (\write18 / --shell-escape is disabled):
   - You MUST NEVER include packages that require external executables, scripts, or interpreters.
   - NEVER use `minted` (which strictly requires Python `pygments` CLI). If syntax highlighting or code boxes are needed, use `listings` or pure `tcolorbox`.
   - NEVER use `pythontex`, `svg` (which requires Inkscape CLI), `gnuplottex`, `epstopdf` (with shell-escape), `pdfcomment`, or similar.

2. NO EXTERNAL AUXILIARY PROCESSORS:
   - The embedded crate does not execute external orchestrators.
   - NEVER use `glossaries` (which requires the Perl `makeglossaries` CLI), `nomencl` (which requires `makeindex` CLI), `biber`, or `xindy`.
   - Use standard LaTeX environments or standard `bibtex` commands for references/glossaries.

3. XETEX ENGINE PRIMITIVES ONLY (NOT pdfTeX / LuaTeX):
   - The engine is XeTeX. Never use packages or macros designed exclusively for pdfTeX or LuaTeX (e.g., `luacode`, `luatexbase`, `pdftexcmds` macros depending on pdfTeX engine).
   - XeTeX supports native UTF-8; avoid legacy `\usepackage[utf8]{inputenc}` when using `fontspec`.
   - `microtype` under XeTeX only supports character protrusion/margin kerning; do NOT enable font expansion.

4. STRICT BUNDLE PACKAGE AVAILABILITY:
   - Tectonic 0.17.0 fetches packages on demand from its official TeXLive bundle.
   - DO NOT introduce obscure, obsolete, or non-standard CTAN packages that may not exist in the official Tectonic bundle.
   - NEVER reference local external custom `.sty` or `.cls` files that are not embedded in the document.
   - PRESERVE EXISTING PREAMBLE: DO NOT add unnecessary `\usepackage{...}` declarations. Retain the template's existing `\documentclass` and imported packages.
   - FULLY VERIFIED & SUPPORTED STANDARD PACKAGES IN TECTONIC 0.17.0:
     * Layout & Spacing: `geometry`, `fancyhdr`, `titlesec`, `enumitem`, `parskip`, `multicol`, `ragged2e`, `setspace`.
     * Tables: `tabularx`, `array`, `booktabs`, `colortbl`, `multirow`.
     * Styling & Color: `xcolor`, `hyperref`, `url`, `tcolorbox`.
     * Fonts & Symbols: `fontawesome5`, `marvosym`, `amsmath`, `amssymb`, `fontspec`, `charter`, `helvet`.
"#;

/// Prompt builders for the refine/fix flows. Owned by this section —
/// `ai` is transport only and must never hardcode prompt wording.
fn refine_prompts(content: &str, instruction: &str, content_type: &str) -> (String, String) {
    let engine_rules = if content_type.to_lowercase().contains("latex") {
        TECTONIC_LATEX_CRATE_RULES
    } else {
        ""
    };

    let system_prompt = format!(
        r#"You are an expert technical document editor specializing in {}. Your task is to apply specific refinements or formatting changes as requested by the user.

Rules:
1. Preserve all existing logic and meaning unless specifically asked to change it.
2. Maintain valid {} syntax at all times.
3. Output ONLY the modified code with no markdown, no explanations, no code fences.
4. Ensure the output is ready for rendering.
{}"#,
        content_type, content_type, engine_rules
    );

    let user_prompt = format!(
        r#"Current {} Content:
{}

Requested Refinement:
{}

Please apply the requested changes. Return only the updated code."#,
        content_type, content, instruction
    );

    (system_prompt, user_prompt)
}

fn fix_prompts(broken_content: &str, error_logs: &str, content_type: &str) -> (String, String) {
    let engine_rules = if content_type.to_lowercase().contains("latex") {
        TECTONIC_LATEX_CRATE_RULES
    } else {
        ""
    };

    let system_prompt = format!(
        r#"You are an expert technical debugger specializing in {}. Your task is to fix syntax errors or logic issues based on provided error logs.

Rules:
1. Fix the specific errors mentioned in the logs.
2. DO NOT change the core meaning unless necessary to fix the error.
3. Output ONLY the corrected {} code with no markdown, no explanations, no code fences.
4. Ensure the output is valid and renderable.
{}"#,
        content_type, content_type, engine_rules
    );

    let user_prompt = format!(
        r#"Broken {} Code:
{}

Error Logs:
{}

Please fix the code so it renders successfully. Return only the fixed code."#,
        content_type, broken_content, error_logs
    );

    (system_prompt, user_prompt)
}

#[command]
pub async fn refine_latex_with_ai(
    state: State<'_, AppState>,
    provider: String,
    model: String,
    api_key: String,
    current_latex: String,
    instruction: String,
) -> Result<String, String> {
    let custom_base_url = crate::commands::settings::get_custom_base_url(&state, &provider).await;
    let (system_prompt, user_prompt) = refine_prompts(&current_latex, &instruction, "LaTeX");
    let res = ai::complete(
        &provider,
        &model,
        &api_key,
        custom_base_url.as_deref(),
        &system_prompt,
        &user_prompt,
        "Refinement",
    )
    .await;
    if let Err(ref e) = res {
        let _ = crate::commands::error_logs::record_error_log_state(
            &state,
            "ai_refining",
            "AiError",
            "Failed to refine LaTeX with AI",
            Some(e),
            Some("refine_latex_with_ai"),
        );
    }
    res
}

#[command]
pub async fn fix_latex_with_ai(
    state: State<'_, AppState>,
    provider: String,
    model: String,
    api_key: String,
    broken_latex: String,
    error_logs: String,
) -> Result<String, String> {
    let custom_base_url = crate::commands::settings::get_custom_base_url(&state, &provider).await;
    let (system_prompt, user_prompt) = fix_prompts(&broken_latex, &error_logs, "LaTeX");
    let res = ai::complete(
        &provider,
        &model,
        &api_key,
        custom_base_url.as_deref(),
        &system_prompt,
        &user_prompt,
        "Fix",
    )
    .await;
    if let Err(ref e) = res {
        let _ = crate::commands::error_logs::record_error_log_state(
            &state,
            "ai_fixing",
            "AiError",
            "Failed to fix LaTeX with AI",
            Some(e),
            Some("fix_latex_with_ai"),
        );
    }
    res
}

#[command]
pub async fn refine_diagram_with_ai(
    state: State<'_, AppState>,
    provider: String,
    model: String,
    api_key: String,
    current_code: String,
    instruction: String,
    content_type: String,
) -> Result<String, String> {
    let custom_base_url = crate::commands::settings::get_custom_base_url(&state, &provider).await;
    let (system_prompt, user_prompt) = refine_prompts(&current_code, &instruction, &content_type);
    let res = ai::complete(
        &provider,
        &model,
        &api_key,
        custom_base_url.as_deref(),
        &system_prompt,
        &user_prompt,
        "Refinement",
    )
    .await;
    if let Err(ref e) = res {
        let _ = crate::commands::error_logs::record_error_log_state(
            &state,
            "ai_refining",
            "AiError",
            "Failed to refine diagram with AI",
            Some(e),
            Some("refine_diagram_with_ai"),
        );
    }
    res
}

#[command]
pub async fn fix_diagram_with_ai(
    state: State<'_, AppState>,
    provider: String,
    model: String,
    api_key: String,
    broken_code: String,
    error_logs: String,
    content_type: String,
) -> Result<String, String> {
    let custom_base_url = crate::commands::settings::get_custom_base_url(&state, &provider).await;
    let (system_prompt, user_prompt) = fix_prompts(&broken_code, &error_logs, &content_type);
    let res = ai::complete(
        &provider,
        &model,
        &api_key,
        custom_base_url.as_deref(),
        &system_prompt,
        &user_prompt,
        "Fix",
    )
    .await;
    if let Err(ref e) = res {
        let _ = crate::commands::error_logs::record_error_log_state(
            &state,
            "ai_fixing",
            "AiError",
            "Failed to fix diagram with AI",
            Some(e),
            Some("fix_diagram_with_ai"),
        );
    }
    res
}

#[command]
pub async fn compile_resume_to_pdf(
    app_handle: AppHandle,
    latex_code: String,
    filename: Option<String>,
) -> Result<Vec<u8>, String> {
    let docs_dir = app_handle
        .path()
        .document_dir()
        .map_err(|e| format!("Failed to get documents dir: {}", e))?;
    let roletect_dir = docs_dir.join("RoleTect");
    if !roletect_dir.exists() {
        std::fs::create_dir_all(&roletect_dir)
            .map_err(|e| format!("Failed to create RoleTect dir: {}", e))?;
    }
    let output_name = filename.unwrap_or_else(|| "output.pdf".to_string());
    let output_pdf_path = roletect_dir.join(output_name);

    let res = tokio::task::spawn_blocking(move || {
        let thread_handle = std::thread::Builder::new()
            .name("tectonic-compiler".into())
            .stack_size(100 * 1024 * 1024)
            .spawn(move || {
                let mut status = CapturingStatusBackend::new();

                let config_loader = tectonic::config::PersistentConfig::default();
                let bundle = config_loader
                    .default_bundle(false)
                    .map_err(|e| format!("Failed to load Tectonic bundle: {}", e))?;

                let format_cache_path = config_loader
                    .format_cache_path()
                    .map_err(|e| format!("Failed to get format cache path: {}", e))?;

                let mut sb = tectonic::driver::ProcessingSessionBuilder::default();
                let temp_output_dir =
                    std::env::temp_dir().join(format!("roletect-{}", nanoid::nanoid!()));
                std::fs::create_dir_all(&temp_output_dir)
                    .map_err(|e| format!("Failed to create temp output dir: {}", e))?;

                sb.bundle(bundle)
                    .primary_input_buffer(latex_code.as_bytes())
                    .tex_input_name("texput")
                    .filesystem_root(std::env::temp_dir()) // Use temp dir for intermediate files
                    .output_dir(&temp_output_dir)
                    .format_cache_path(format_cache_path)
                    .format_name("latex")
                    .output_format(tectonic::driver::OutputFormat::Pdf)
                    .build_date(std::time::SystemTime::now());

                let mut sess = sb
                    .create(&mut status)
                    .map_err(|e| format!("Failed to create Tectonic session: {}\n\nLogs:\n{}", e, status.logs))?;

                sess.run(&mut status)
                    .map_err(|e| format!("Compilation failed: {}\n\nLogs:\n{}", e, status.logs))?;

                let temp_pdf_path = temp_output_dir.join("texput.pdf");
                if temp_pdf_path.exists() {
                    let pdf_data = std::fs::read(&temp_pdf_path)
                        .map_err(|e| format!("Failed to read generated PDF: {}", e))?;

                    // Copy it to Documents/RoleTect/output.pdf
                    let _ = std::fs::write(&output_pdf_path, &pdf_data);

                    // Clean up temp dir
                    let _ = std::fs::remove_dir_all(&temp_output_dir);

                    Ok(pdf_data)
                } else {
                    let _ = std::fs::remove_dir_all(&temp_output_dir);
                    Err(format!(
                        "Compilation appeared successful, but PDF was not found at {:?}\n\nLogs:\n{}",
                        temp_pdf_path, status.logs
                    ))
                }
            })
            .map_err(|e| format!("Failed to spawn compiler thread: {}", e))?;

        thread_handle
            .join()
            .map_err(|_| "Compiler thread panicked".to_string())?
    })
    .await
    .map_err(|e| format!("Blocking task failed: {}", e))?;

    if let Err(ref e) = res {
        let _ = crate::commands::error_logs::record_error_log_app(
            &app_handle,
            "compiling",
            "TectonicCompilationError",
            "Resume LaTeX compilation failed",
            Some(e),
            Some("compile_resume_to_pdf"),
        );
    }

    res
}

#[command]
pub async fn compile_workspace_to_pdf(
    app_handle: AppHandle,
    workspace_dir: String,
    main_file_name: String,
    filename: Option<String>,
) -> Result<Vec<u8>, String> {
    compile_workspace_to_pdf_inner(app_handle, workspace_dir, main_file_name, filename).await
}

pub(crate) async fn compile_workspace_to_pdf_inner(
    app_handle: AppHandle,
    workspace_dir: String,
    main_file_name: String,
    filename: Option<String>,
) -> Result<Vec<u8>, String> {
    let docs_dir = app_handle
        .path()
        .document_dir()
        .map_err(|e| format!("Failed to get documents dir: {}", e))?;
    let roletect_dir = docs_dir.join("RoleTect");
    if !roletect_dir.exists() {
        std::fs::create_dir_all(&roletect_dir)
            .map_err(|e| format!("Failed to create RoleTect dir: {}", e))?;
    }
    let output_name = filename.unwrap_or_else(|| "output.pdf".to_string());
    let output_pdf_path = roletect_dir.join(output_name);

    let workspace_path = PathBuf::from(&workspace_dir);

    if !workspace_path.is_dir() {
        return Err(format!(
            "Workspace path '{}' is not a valid directory.",
            workspace_dir
        ));
    }

    let res = tokio::task::spawn_blocking(move || {
        let thread_handle = std::thread::Builder::new()
            .name("tectonic-workspace-compiler".into())
            .stack_size(100 * 1024 * 1024)
            .spawn(move || {
                let mut status = CapturingStatusBackend::new();
                let workspace_path = PathBuf::from(&workspace_dir);

                let config_loader = tectonic::config::PersistentConfig::default();
                let bundle = config_loader
                    .default_bundle(false)
                    .map_err(|e| format!("Failed to load Tectonic bundle: {}", e))?;

                let format_cache_path = config_loader
                    .format_cache_path()
                    .map_err(|e| format!("Failed to get format cache path: {}", e))?;

                // Determine the absolute path to the main file
                let main_file_path = workspace_path.join(&main_file_name);
                if !main_file_path.is_file() {
                    return Err(format!(
                        "Main TeX file '{}' not found in workspace.",
                        main_file_name
                    ));
                }

                let mut sb = tectonic::driver::ProcessingSessionBuilder::default();
                let temp_output_dir =
                    std::env::temp_dir().join(format!("roletect-{}", nanoid::nanoid!()));
                std::fs::create_dir_all(&temp_output_dir)
                    .map_err(|e| format!("Failed to create temp output dir: {}", e))?;

                sb.bundle(bundle)
                    .primary_input_path(&main_file_path)
                    .tex_input_name("texput.tex")
                    .filesystem_root(&workspace_path)
                    .output_dir(&temp_output_dir) // Use temp dir for ALL outputs
                    .format_cache_path(format_cache_path)
                    .format_name("latex")
                    .output_format(tectonic::driver::OutputFormat::Pdf);

                let mut sess = sb
                    .create(&mut status)
                    .map_err(|e| format!("Failed to create Tectonic session: {}\n\nLogs:\n{}", e, status.logs))?;

                sess.run(&mut status)
                    .map_err(|e| format!("Compilation failed: {}\n\nLogs:\n{}", e, status.logs))?;

                // The PDF will be named texput.pdf in the temp_output_dir
                let temp_pdf_path = temp_output_dir.join("texput.pdf");

                if temp_pdf_path.exists() {
                    let pdf_data = std::fs::read(&temp_pdf_path)
                        .map_err(|e| format!("Failed to read generated PDF: {}", e))?;

                    // Copy it to the same directory as the compiling source file
                    let mut final_pdf_path = workspace_path.join(&main_file_name);
                    final_pdf_path.set_extension("pdf");
                    let _ = std::fs::write(&final_pdf_path, &pdf_data);

                    // ALSO copy to Documents/RoleTect/output.pdf
                    let _ = std::fs::write(&output_pdf_path, &pdf_data);

                    // Clean up temp dir
                    let _ = std::fs::remove_dir_all(&temp_output_dir);

                    Ok(pdf_data)
                } else {
                    let _ = std::fs::remove_dir_all(&temp_output_dir);
                    Err(format!(
                        "Compilation appeared successful, but PDF was not found at {:?}\n\nLogs:\n{}",
                        temp_pdf_path, status.logs
                    ))
                }
            })
            .map_err(|e| format!("Failed to spawn compiler thread: {}", e))?;

        thread_handle
            .join()
            .map_err(|_| "The compiler thread panicked.".to_string())?
    })
    .await
    .map_err(|e| format!("The asynchronous task failed: {}", e))?;

    if let Err(ref e) = res {
        let _ = crate::commands::error_logs::record_error_log_app(
            &app_handle,
            "compiling",
            "TectonicCompilationError",
            "Workspace LaTeX compilation failed",
            Some(e),
            Some("compile_workspace_to_pdf"),
        );
    }

    res
}

#[cfg(test)]
mod tests {
    use super::*;
    use tectonic::status::{MessageKind, StatusBackend};

    const EXPECTED_STACK_SIZE: usize = 100 * 1024 * 1024; // 100 MB

    #[test]
    fn capturing_backend_records_errors() {
        let mut backend = CapturingStatusBackend::new();
        backend.report(
            MessageKind::Error,
            format_args!("missing \\begin{{document}}"),
            None,
        );
        assert!(backend.logs.contains("error: missing \\begin{document}"));
    }

    #[test]
    fn capturing_backend_records_warnings() {
        let mut backend = CapturingStatusBackend::new();
        backend.report(MessageKind::Warning, format_args!("overfull hbox"), None);
        assert!(backend.logs.contains("warning: overfull hbox"));
    }

    #[test]
    fn capturing_backend_records_notes() {
        let mut backend = CapturingStatusBackend::new();
        backend.report(MessageKind::Note, format_args!("output written"), None);
        assert!(backend.logs.contains("note: output written"));
    }

    #[test]
    fn capturing_backend_dumps_error_logs() {
        let mut backend = CapturingStatusBackend::new();
        backend.dump_error_logs(b"! LaTeX Error: File not found.\n");
        assert!(backend.logs.contains("--- Underlying Error Logs ---"));
        assert!(backend.logs.contains("! LaTeX Error: File not found."));
    }

    #[test]
    fn compiler_thread_can_spawn_with_100mb_stack() {
        let handle = std::thread::Builder::new()
            .name("stack-size-test".into())
            .stack_size(EXPECTED_STACK_SIZE)
            .spawn(|| {
                // Allocate a modest chunk on the stack to prove the space is available
                let _buf = [0u8; 1024 * 1024]; // 1 MB on stack
                42
            })
            .expect("Failed to spawn thread with 100MB stack");

        let result = handle.join().expect("Thread panicked");
        assert_eq!(result, 42);
    }
}
