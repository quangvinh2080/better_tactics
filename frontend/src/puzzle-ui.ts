import {
    init,
    classModule,
    propsModule,
    styleModule,
    attributesModule,
    datasetModule,
    eventListenersModule,
    h,
    VNode,
} from 'snabbdom';
import moment from 'moment';
import { Chess } from 'chess.js';
import { PuzzleBoard } from './puzzle-board.js';
import { asset_path } from './util.js';

const patch = init([
    classModule,
    propsModule,
    styleModule,
    eventListenersModule,
    attributesModule,
    datasetModule,
]);

const DIFFICULTY_AGAIN = 0;
const DIFFICULTY_HARD = 1;
const DIFFICULTY_GOOD = 2;
const DIFFICULTY_EASY = 3;

export class PuzzleUi {
    config: any;
    vnode: Element | VNode;

    analysis_fen: string = null;

    disable_review_buttons: boolean = true;

    first_try: boolean = true;
    hint_used: boolean = false;

    // Kid mode: frontend-only session state. Counts completed puzzles in
    // this page session; the limit comes from the page config.
    session_completed: number = 0;
    session_limit: number = 10;
    session_finished: boolean = false;
    kid_theme: string = null;

    puzzle: PuzzleBoard = null;

    countdown_interval: number = null;

    constructor(container, config) {
        this.config = {};
        this.vnode = container;

        // Render once and create the puzzle board.
        this.render();
        
        this.puzzle = new PuzzleBoard(document.getElementById("board"), {
            on_success: this.on_puzzle_board_change.bind(this),
            on_move: this.on_puzzle_board_change.bind(this),
            on_right_move: this.on_puzzle_board_change.bind(this),
            on_wrong_move: () => { this.first_try = false; this.on_puzzle_board_change(); },
            on_seek: this.on_puzzle_board_change.bind(this),
            on_promote: this.render.bind(this),
        });

        this.configure(config ? config : {});
        this.request_data();
    }

    on_puzzle_board_change() {
        // If something on the puzzle changes due to user input (e.g. a new move or seeking),
        // disable the next move hint.
        this.puzzle.set_next_move_highlight('none');

        // Re-render the ui to reflect the updated puzzle state.
        this.render();
    }

    configure(config) {
        console.log(config);

        if (config.puzzle && config.puzzle.fen && config.puzzle.moves) {
            let puzzle = config.puzzle;

            // Use the fen figure out the fen for analysis. Ideally we'd just pass the puzzle fen
            // and first move to the analysis board, but lichess only supports pgn or fen, and not
            // both; so we use chess.js to figure out the fen after the first computer move and use
            // that instead.
            try {
                let game = new Chess(config.puzzle.fen);
                let first_move = config.puzzle.moves.split(' ')[0];
                game.move(first_move);
                this.analysis_fen = game.fen();
            }
            catch (e) {
                console.error("Error when using chess.js to get initial board state for analysis");
                console.error(e);
            }
        }

        if (config.board_config) {
            this.puzzle.configure(config.board_config);
        }

        // If a new puzzle is configured.
        if (config.puzzle) {
            // Create puzzle board.
            this.puzzle.configure({
                puzzle_id: config.puzzle ? config.puzzle.puzzle_id : null,
                fen: config.puzzle ? config.puzzle.fen : null,
                moves: config.puzzle ? config.puzzle.moves : null,
                puzzle_rating: config.puzzle ? config.puzzle.rating : null,
            });
        }

        // Kid mode settings arrive with the page config. They are only
        // present on the first configure() call, so keep previous values
        // when later data updates do not carry them.
        if (typeof config.session_limit === "number") {
            this.session_limit = config.session_limit;
        }
        if (config.kid_theme !== undefined) {
            this.kid_theme = config.kid_theme;
        }

        // Store whether it's currently the first try or not, so we know if it's a successful solve or not.
        this.first_try = true;
        this.hint_used = false;

        // Re-render the layout.
        this.config = Object.assign(this.config, config);
        this.render();
    }

    render() {
        try {
            this.vnode = patch(this.vnode, this.view());
        }
        catch (err) {
            let error_text = "";
            if (err && err.message) {
                error_text = err.message;
                console.error(err);
            }

            let error_view = h('div.error.fatal', `Lỗi khi hiển thị: ${error_text}`);
            this.vnode = patch(this.vnode, error_view);
        }
    }

    request_data() {
        if (this.session_finished) {
            this.config.loading = false;
            this.render();
            return;
        }
        if (typeof this.config.request_data === "function") {
            console.log("Puzzle ui: requesting data");
            this.config.error = null;
            this.config.loading = true;
            this.render();

            this.config.request_data()
                .then(data => {
                    this.configure(data);
                    this.config.loading = false;
                    this.disable_review_buttons = false;
                    this.render();
                })
                .catch(err => {
                    this.config.error = `Không lấy được bài: ${err.responseJSON.error}`;
                    this.config.loading = false;
                    this.render();

                    console.error(this.config.error);
                });
        }
    }

    view() {
        return h('div#puzzle-interface', [
            this.topbar(),

            h('div.columns', [
                // The board column on the left.
                h('div.is-two-thirds.column', [
                    h('div#board-container.bt-panel', [
                        // Chessground container.
                        h('div#board.chessground', {
                            on: { wheel: this.on_wheel.bind(this) }
                        }),

                        // Promotion ui.
                        this.promotion_ui(),
                    ]),
                ]),

                // The sidebar.
                this.sidebar(),
            ])
        ]);
    }

    topbar() {
        return h('div#top-bar.columns.bt-panel', this.topbar_contents());
    }

    goal_text() {
        if (this.kid_theme == 'mateIn1') {
            return 'Tìm nước chiếu hết trong 1 nước';
        }
        else if (this.kid_theme == 'hangingPiece') {
            return 'Tìm nước ăn quân không được bảo vệ';
        }
        else if (this.kid_theme == 'fork') {
            return 'Tìm nước bắt đôi';
        }
        return 'Tìm nước đi tốt nhất';
    }

    session_done_text() {
        return `Hôm nay xong rồi, nghỉ nhé! (${this.session_completed} bài)`;
    }

    topbar_contents() {
        if (this.config.error) {
            return h('div.error.fatal', [ 'Lỗi: ', this.config.error ]);
        }
        else if (this.session_finished) {
            return h('p', [ this.session_done_text() ]);
        }
        else if (this.config.loading) {
            return 'Đang lấy bài tiếp theo...';
        }
        else if (this.config.mode) {
            let mode = this.config.mode;
            if (mode == "Random") {
                if (this.config.puzzle) {
                    // Kid mode: show the goal, never the rating range.
                    return this.goal_text();
                }
                else {
                    return "Không tìm thấy bài nào, thử lại nhé";
                }
            }
            else if (mode == "Specific") {
                if (this.config.puzzle) {
                    return this.goal_text();
                }
                else {
                    return 'Không có bài này';
                }
            }
            else if (mode == "Review" && this.config.stats) {
                if (this.config.puzzle) {
                    let reviews_left = this.config.stats.reviews_due_now;
                    return `Đang ôn bài tiếp theo (còn ${reviews_left} bài)`;
                }
                else {
                    let due = 'unknown';
                    if (typeof this.config.stats.ms_until_due === "number") {
                        due = this.countdown_duration(this.config.stats.ms_until_due);
                        this.start_review_countdown();
                    }

                    let done_text = this.config.stats.reviews_due_today > 0
                        ? `Bạn đã ôn xong rồi, bài ôn tiếp theo sau ${due}.`
                        : 'Bạn đã ôn xong hôm nay rồi!';

                    return h('p', [
                        done_text,
                        h('br'),
                        "Thử thêm ",
                        h('a', { props: { href: '/tactics/new' } }, 'bài mới'),
                        ' nhé? Hoặc quay về ',
                        h('a', { props: { href: '/' } }, 'trang chính'),
                        '.'
                    ]);
                }
            }
        }

        return 'Lỗi';
    }

    promotion_ui() {
        if (!this.puzzle) {
            return h('div');
        }

        return h('div#promotion-ui',
            {
                on: {
                    click: this.on_promotion_background_clicked.bind(this),
                    contextmenu: e => e.preventDefault(),
                },
                style: {
                    visibility: this.puzzle.awaiting_promotion() ? "unset" : "hidden",
                },
            },
            [
                h('div#white.promotion-pieces', [
                    this.promotion_button('q'),
                    this.promotion_button('r'),
                    this.promotion_button('n'),
                    this.promotion_button('b'),
                ]),
            ]
        );
    }

    promotion_button(piece) {
        return h('button.promotion-piece', {
            dataset: { piece: piece, color: this.puzzle.player_color() },
            on: {
                click: e => this.on_promotion_button_clicked(e),
                contextmenu: e => e.preventDefault(),
            },
        });
    }

    sidebar() {
        if (this.session_finished) {
            return h('div.column.sidebar', [
                h('div#session-done.bt-panel.controls-subpanel', [
                    h('p', this.session_done_text()),
                ]),
            ]);
        }
        if (this.puzzle && this.config.puzzle && !this.config.loading) {
            return h('div.column.sidebar', [
                this.move_controls(),
                this.puzzle_info(),
                this.side_to_move(),
                this.wrong_move(),
                this.hint_button(),
                this.puzzle_complete(),
                this.puzzle_themes(),
                this.reviewing_ahead(),
                this.skip_button(),
                this.too_hard_button(),
            ]);
        }
    }

    puzzle_info() {
        return h('div#puzzle-info.bt-panel', [
            h('table.stats', [
                h('tbody', [
                    h('tr', [
                        h('th', 'Bài cờ'),
                        h('td', [
                            h('a', { props: { href: `/tactics/by_id/${this.config.puzzle.puzzle_id}` } },
                                this.config.puzzle.puzzle_id),
                        ]),
                    ]),
                ]),
            ]),
            this.analysis_link(),
            this.source_url(),
        ]);
    }

    move_controls() {
        let at_start = this.puzzle.seek_position() == 0;
        let at_end = this.puzzle.seek_position() == this.puzzle.seek_max();

        return h('div#move-controls.bt-panel', [
            h('a', {
                dataset: { action: "start" },
                on: { click: this.seek.bind(this) },
                attrs: { disabled: at_start },
            }, [
                h('svg',
                    h('use', { attrs: { href: asset_path("images/icons/play-backwards.svg#icon") } }),
                ),
            ]),
            h('a', {
                dataset: { action: "prev" },
                on: { click: this.seek.bind(this) },
                attrs: { disabled: at_start },
            }, [
                h('svg',
                    h('use', { attrs: { href: asset_path("images/icons/play-track-prev.svg#icon") } }),
                ),
            ]),
            h('a', {
                dataset: { action: "next" },
                on: { click: this.seek.bind(this) },
                attrs: { disabled: at_end },
            }, [
                h('svg',
                    h('use', { attrs: { href: asset_path("images/icons/play-track-next.svg#icon") } }),
                ),
            ]),
            h('a', {
                dataset: { action: "end" },
                on: { click: this.seek.bind(this) },
                attrs: { disabled: at_end },
            }, [
                h('svg',
                    h('use', { attrs: { href: asset_path("images/icons/play-forwards.svg#icon") } }),
                ),
            ]),
        ]);
    }

    puzzle_themes() {
        if (this.puzzle.is_complete() && this.config.puzzle.themes.length > 0)
        {
            let theme_names: { [key: string]: string } = {
                'mateIn1': 'Chiếu hết 1 nước',
                'hangingPiece': 'Ăn quân treo',
                'fork': 'Bắt đôi',
            };
            let theme_list = this.config.puzzle.themes
                .map(theme => theme_names[theme])
                .filter(name => name);

            if (theme_list.length == 0) {
                return;
            }

            return h('div#puzzle-themes.bt-panel', [
                h('p', [
                    h('b', 'Chủ đề: '),
                    theme_list.join(', '),
                ]),
            ]);
        }
    }

    analysis_link() {
        if (this.analysis_fen) {
            return h('a.analysis-link', { props: {
                target: "_blank",
                href: `https://lichess.org/analysis/standard/${this.analysis_fen}`,
            } }, "Phân tích");
        }
    }

    source_url() {
        return h('a.analysis-link', { props: {
            target: "_blank",
            href: `https://lichess.org/training/${this.config.puzzle.puzzle_id}`,
        } }, "Nguồn");
    }

    card_stats() {
        if (this.config.card && this.config.card.review_count > 0) {
            let ease = this.config.card.ease;
            return h("div#card-details.bt-panel", [
                h("table.stats", [
                    h("tbody", [
                        h("tr", [
                            h("th", "Reviews"),
                            h("td", this.config.card.review_count),
                        ]),
                        h("tr", [
                            h("th", "Ease"),
                            h("td", ease ? ease.toFixed(2) : null),
                        ]),
                        h("tr", [
                            h("th", "Due"),
                            h("td",
                                { props: { title: this.human_due_date(this.config.card.due) } },
                                this.fuzzy_due_date(this.config.card.due)
                            ),
                        ]),
                    ]),
                ]),
            ]);
        }
    }

    fuzzy_due_date(dt) {
        if (this.has_time_passed(dt)) {
            return "now";
        }
        else {
            return moment(dt).from(moment()).replace('in ', '');
        }
    }

    human_due_date(dt) {
        return moment(dt).format('YYYY-MM-DD HH:mm:ss');
    }

    fuzzy_duration(ms) {
        return moment.duration(ms, 'ms').humanize();
    }

    human_interval(ms) {
        const MS_IN_MINUTE = 60 * 1000;
        const MS_IN_HOUR = 60 * MS_IN_MINUTE;
        const MS_IN_DAY = 24 * MS_IN_HOUR;
        const MS_IN_YEAR = 365 * MS_IN_DAY;

        let result = '';

        // Push a value onto the duration string with a given unit, automatically skipping 0 values
        // and adding pluralisation.
        let push_part = (value, unit) => {
            if (value != 0) {
                let comma = (result.length > 0 ? ', ' : '');
                let pluralisation = (value != 1 ? 's' : '');
                result += `${comma}${value} ${unit}${pluralisation}`;
            }
        };

        let years = Math.floor(ms / MS_IN_YEAR);
        let days = Math.floor((ms % MS_IN_YEAR) / MS_IN_DAY);
        let hours = Math.floor((ms % MS_IN_DAY) / MS_IN_HOUR);
        let minutes = Math.floor((ms % MS_IN_HOUR) / MS_IN_MINUTE);

        if (years > 0) {
            push_part(years, 'year');
            push_part(days, 'day');
        }
        else if (days > 0) {
            push_part(days, 'day');
            push_part(hours, 'hour');
        }
        else {
            push_part(hours, 'hour');
            push_part(minutes, 'minute');
        }

        return result;
    }

    countdown_duration(ms) {
        if (ms < 0)
            return "now";
        else if (ms > 60 * 60 * 1000)
            return moment.utc(ms).format("HH:mm:ss");
        else 
            return moment.utc(ms).format("mm:ss");
    }

    has_time_passed(dt) {
        return moment(dt).isBefore(moment());
    }

    side_to_move() {
        if (this.puzzle.is_puzzle_loaded() && !this.puzzle.is_complete() && !this.puzzle.is_failed())
        {
            let turn = this.puzzle.color_to_move();

            let text;
            if (this.puzzle.computer_to_move()) {
                text = "Máy đang đi";
            }
            else if (turn == 'w') {
                text = "Lượt của Trắng";
            }
            else {
                text = "Lượt của Đen";
            }

            return h('div.bt-panel.move-indicator', [
                h('div.to-move-piece', { dataset: { color: turn } }),
                text
            ]);
        }
    }

    skip_button() {
        if (this.config.mode == 'Random' && this.puzzle && this.puzzle.is_first_move()) {
            return h('div#skip-button.bt-panel.controls-subpanel', [
                h('a', { on: { click: this.on_skip_clicked.bind(this) } }, "Bỏ qua bài này"),
            ]);
        }
    }

    too_hard_button() {
        let complete_with_mistakes = this.puzzle.is_complete() && !this.first_try;
        let failed = this.puzzle.is_failed();
        if (this.config.mode == 'Random' && (failed || complete_with_mistakes)) {
            return h('div#too-hard-button.bt-panel.controls-subpanel', [
                h('a', { on: { click: this.on_too_hard_clicked.bind(this) } }, "Khó quá, đổi bài dễ hơn"),
            ]);
        }
    }

    reviewing_ahead() {
        if (this.config.puzzle && !this.config.due_today) {
            return h('div#reviewing-ahead.bt-panel.controls-subpanel',
                "Bạn đang ôn trước. Bài này sẽ được hẹn lại xa hơn mỗi lần làm xong.");
        }
    }

    wrong_move() {
        if (this.puzzle.is_failed()) {
            return h('div#wrong-move.bt-panel.controls-subpanel', [
                h('p', 'Đi sai rồi, thử lại'),
                h('div.columns.button-container', [
                    h('div.column'),
                    h('div.column', [
                        h('button#try-again.button',
                            { on: { click: () => { this.puzzle.reset(); this.render(); } } },
                            [
                                h('p.main-text', 'Thử lại'),
                            ],
                        ),
                    ]),
                    h('div.column'),
                ]),
            ]);
        }
    }

    puzzle_complete() {
        let ui = this;

        if (this.puzzle.is_complete()) {
            // Kid mode auto-grading: no self-scored Again/Hard/Good/Easy
            // buttons. A clean first try with no hint counts as Good;
            // solving after a mistake or a hint counts as Hard. There is
            // no Easy button, so the rating cannot jump by pressing it.
            let difficulty = (this.first_try && !this.hint_used)
                ? DIFFICULTY_GOOD
                : DIFFICULTY_HARD;
            return h('div#reviewing-ahead.bt-panel.controls-subpanel', [
                h('p', 'Xong rồi!'),
                h('div.columns.button-container', [
                    h('div.column', [
                        h('button#next-puzzle.button.review-button', {
                            on: { click: function() { ui.on_review_button_clicked(this); } },
                            dataset: { difficulty: difficulty.toString() },
                            attrs: {
                                disabled: this.disable_review_buttons,
                            },
                        }, [
                            h('p.main-text', 'Bài tiếp theo'),
                            h('p.sub-text', 'Đã làm ' + (this.session_completed + 1) + '/' + this.session_limit + ' bài'),
                        ]),
                    ]),
                ]),
            ]);
        }
    }

    hint_button() {
        if (this.puzzle && !this.puzzle.is_complete() && !this.puzzle.is_failed()) {
            let button_text;

            let mode = this.puzzle.get_next_move_highlight();
            // If the move is already shown it should be a 'hide hints' button.
            if (mode == 'move')
                button_text = 'Ẩn gợi ý';
            // If the piece is already highlighted it should be a 'show move' button.
            else if (mode == 'orig')
                button_text = 'Gợi ý nước đi';
            // If nothing is currently highlighted it should be a 'show piece' button.
            else
                button_text = 'Gợi ý quân';

            let disable_button = this.puzzle.computer_to_move() || this.puzzle.awaiting_promotion();

            return h('div#hint-button.bt-panel.controls-subpanel', [
                h('a.puzzle-link-button', {
                    on: { click: this.on_hint_button_clicked.bind(this) },
                    attrs: { disabled: disable_button },
                }, button_text),
            ]);
        }
    }

    on_hint_button_clicked() {
        // Using a hint means this solve counts as Hard, not Good, in kid mode auto-grading.
        this.first_try = false;
        this.hint_used = true;

        // Get the current hint mode.
        let cur = this.puzzle.get_next_move_highlight();

        // If the move is already highlighted, disable the highlight.
        if (cur == 'move') {
            this.puzzle.set_next_move_highlight('none');
        }
        // If the piece to move is already highlighted, show the move itself.
        else if (cur == 'orig') {
            this.puzzle.set_next_move_highlight('move');
        }
        // If the mode is 'none', start by highlighting the piece.
        else {
            this.puzzle.set_next_move_highlight('orig');
        }

        this.render();
    }

    on_promotion_button_clicked(event) {
        if (this.puzzle.awaiting_promotion()) {
            let piece = event.target.dataset.piece;
            console.info(`Promoting to piece ${piece}`);

            this.puzzle.promote(piece);
            this.render();
        }
        event.stopPropagation();
    }

    on_promotion_background_clicked() {
        // If the user clicks the background, cancel promotion.
        if (this.puzzle.awaiting_promotion()) {
            console.info("Cancelling promotion");
            this.puzzle.cancel_promotion();
            this.render();
        }
        event.stopPropagation();
    }

    on_review_button_clicked(button) {
        if (!this.config.card) {
            console.error("Attempt to review when this.config.card does not exist");
            return;
        }

        let card = this.config.card;
        let puzzle_id = card.id;
        let difficulty = parseInt(button.data.dataset.difficulty);
        console.log(`Reviewing ${puzzle_id} with difficulty ${difficulty}`);

        if (this.config.on_review) {
            this.disable_review_buttons = true;
            this.render();

            this.config.on_review(card, difficulty)
                .then(() => {
                    this.session_completed += 1;
                    if (this.session_completed >= this.session_limit) {
                        // Session limit reached: stop here, do not fetch more.
                        this.session_finished = true;
                        this.config.puzzle = null;
                        this.config.loading = false;
                        this.disable_review_buttons = false;
                        this.render();
                    }
                    else {
                        console.log("Done, loading next puzzle");
                        this.request_data();
                    }
                })
                .catch((e) => {
                    this.config.error = `Không gửi được kết quả: ${e.responseText}`;
                    console.error(this.config.error);
                    this.disable_review_buttons = false;
                    this.render();
                });
        }
    }

    on_skip_clicked(button) {
        if (window.confirm("Bạn có chắc muốn bỏ qua bài này không?")) {
            // Skip the puzzle and request a new one. We don't update the rating as the user
            // hasn't solved it, or indicated that it was too hard.
            this.skip_puzzle(DIFFICULTY_GOOD, false);
        }
    }

    on_too_hard_clicked(button) {
        if (window.confirm("Bỏ qua bài này và xem bài dễ hơn nhé?")) {
            // Update rating like the puzzle was failed, but don't add it to spaced repetition.
            this.skip_puzzle(DIFFICULTY_AGAIN, true);
        }
    }

    // Scroll wheel.
    on_wheel(evt) {
        if (evt.deltaY < 0) {
            this.puzzle.seek_prev();
        }
        else {
            this.puzzle.seek_next();
        }
        evt.stopPropagation();
        evt.preventDefault();
    }

    skip_puzzle(difficulty, update_rating) {
        if (this.config.on_skip && this.config.card) {
            this.disable_review_buttons = true;

            this.config.on_skip(this.config.card, difficulty, update_rating)
                .then(() => {
                    console.log("Skipped, loading next puzzle");
                    this.request_data();
                })
                .catch((e) => {
                    this.config.error = `Không bỏ qua được bài: ${e.responseText}`;
                    console.error(this.config.error);
                    this.disable_review_buttons = false;
                    this.render();
                });
        }
    }

    start_review_countdown() {
        if (!this.countdown_interval && this.config.stats && this.config.stats.ms_until_due > 0) {
            console.log('Starting countdown');
            this.countdown_interval = setInterval(() => {
                this.config.stats.ms_until_due = Math.max(0, this.config.stats.ms_until_due - 1000);
                this.render();

                if (this.config.stats.ms_until_due <= 0) {
                    console.log('Countdown done');
                    clearInterval(this.countdown_interval);
                    this.countdown_interval = null;
                    this.request_data();
                }
            }, 1000);
        }
    }

    seek(button) {
        let action = button.target.dataset.action;

        if (action == "start") {
            this.puzzle.seek_start();
        }
        else if (action == "prev") {
            this.puzzle.seek_prev();
        }
        else if (action == "next") {
            this.puzzle.seek_next();
        }
        else if (action == "end") {
            this.puzzle.seek_end();
        }
    }
}
