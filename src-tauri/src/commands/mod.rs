pub mod cloud;
pub mod compiler;
pub mod cover_letters;
pub mod data;
pub mod documents;
pub mod downloads;
pub mod inbox;
pub mod jobs;
pub mod pdf;
pub mod resumes;
pub mod scoring;
pub mod settings;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TailoredContent {
    pub id: String,
    pub base_template_id: String,
    pub content: String,
}
