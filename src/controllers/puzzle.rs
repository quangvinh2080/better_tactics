use std::fmt::Display;
use askama::Template;
use axum::extract::{Path, Query, State};

use crate::app::{UiConfig, AppState, TacticsConfig};

use super::{BaseTemplateData, ControllerError};

/// The puzzle mode.
#[derive(Debug, PartialEq, Eq)]
pub enum PuzzleMode {
    /// We're showing a review.
    Review,

    /// We're showing a random new puzzle.
    Random,

    /// We're showing a specifically requested puzzle.
    Specific,
}

impl Display for PuzzleMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PuzzleMode::Review => write!(f, "Review"),
            PuzzleMode::Random => write!(f, "Random"),
            PuzzleMode::Specific => write!(f, "Specific"),
        }
    }
}

/// The template for displaying puzzles.
#[derive(Template)]
#[template(path = "puzzle.html")]
pub struct PuzzleTemplate {
    base: BaseTemplateData,
    mode: PuzzleMode,
    tactics_config: TacticsConfig,
    ui_config: UiConfig,
    kid_max_rating: i64,
    kid_session_count: i64,
    kid_themes: String,
    requested_id: String,
}

/// The puzzle history request.
#[derive(serde::Deserialize)]
pub struct PuzzleHistoryRequest {
    page: Option<i64>,
}

/// The puzzle history page template.
#[derive(Template, Default)]
#[template(path = "puzzle-history.html")]
pub struct PuzzleHistoryTemplate {
    base: BaseTemplateData,
    page: i64,
}

/// GET /tactics/by_id/{puzzle_id}
pub async fn specific_puzzle(
    State(state): State<AppState>,
    Path(puzzle_id): Path<String>
) -> Result<PuzzleTemplate, ControllerError>
{
    Ok(PuzzleTemplate {
        base: Default::default(),
        mode: PuzzleMode::Specific,
        tactics_config: state.app_config.tactics,
        ui_config: state.app_config.ui,
        kid_max_rating: state.app_config.kid.max_rating,
        kid_session_count: state.app_config.kid.session_count,
        kid_themes: state.app_config.kid.themes.join(","),
        requested_id: puzzle_id,
    })
}

/// GET /tactics/new
pub async fn random_puzzle(
    State(state): State<AppState>,
) -> Result<PuzzleTemplate, ControllerError>
{
    Ok(PuzzleTemplate {
        base: Default::default(),
        mode: PuzzleMode::Random,
        tactics_config: state.app_config.tactics,
        ui_config: state.app_config.ui,
        kid_max_rating: state.app_config.kid.max_rating,
        kid_session_count: state.app_config.kid.session_count,
        kid_themes: state.app_config.kid.themes.join(","),
        requested_id: "".to_string(),
    })
}

/// GET /tactics
pub async fn next_review(
    State(state): State<AppState>,
) -> Result<PuzzleTemplate, ControllerError>
{
    Ok(PuzzleTemplate {
        base: Default::default(),
        mode: PuzzleMode::Review,
        tactics_config: state.app_config.tactics,
        ui_config: state.app_config.ui,
        kid_max_rating: state.app_config.kid.max_rating,
        kid_session_count: state.app_config.kid.session_count,
        kid_themes: state.app_config.kid.themes.join(","),
        requested_id: "".to_string(),
    })
}

/// GET /tactics/history
pub async fn puzzle_history(
    Query(request): Query<PuzzleHistoryRequest>,
) -> PuzzleHistoryTemplate
{
    PuzzleHistoryTemplate {
        page: request.page.unwrap_or(1).max(1),
        ..Default::default()
    }
}
