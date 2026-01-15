
(function ($) {
    $(document).ready(function () {
        // 1. Inject CSS
        const modalStyles = `
            <style>
                .query-modal-overlay {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.7);
                    z-index: 9999;
                    justify-content: center;
                    align-items: center;
                    backdrop-filter: blur(5px);
                }
                .query-modal-content {
                    background: #1f272b;
                    padding: 30px;
                    border-radius: 15px;
                    width: 90%;
                    max-width: 500px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    position: relative;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                }
                .query-modal-close {
                    position: absolute;
                    top: 15px;
                    right: 15px;
                    color: #fff;
                    font-size: 24px;
                    cursor: pointer;
                    line-height: 1;
                }
                .query-input {
                    width: 100%;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    color: #fff;
                    padding: 10px;
                    margin-bottom: 15px;
                    font-size: 14px;
                }
                .query-input:focus {
                    outline: none;
                    border-color: #00a651;
                    background: rgba(255, 255, 255, 0.15);
                }
                .query-submit-btn {
                    width: 100%;
                    background: #00a651;
                    color: #fff;
                    border: none;
                    padding: 12px;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.3s;
                }
                .query-submit-btn:hover {
                    background: #008a44;
                }
                .query-modal-title {
                    color: #fff;
                    margin-bottom: 20px;
                    text-align: center;
                    font-size: 20px;
                    font-weight: 600;
                }
            </style>
        `;
        $('head').append(modalStyles);

        // 2. Inject Modal HTML
        const modalHTML = `
            <div class="query-modal-overlay" id="queryModal">
                <div class="query-modal-content">
                    <span class="query-modal-close" onclick="closeQueryModal()">&times;</span>
                    <h3 class="query-modal-title">Send Query / Error / Suggestion</h3>
                    <form id="queryForm">
                        <input type="text" class="query-input" id="queryName" placeholder="Your Name" required>
                        <input type="email" class="query-input" id="queryEmail" placeholder="Your Email" required>
                        <textarea class="query-input" id="queryMessage" rows="5" placeholder="Describe your query, error found, or suggestion..." required></textarea>
                        <button type="submit" class="query-submit-btn">Send Message</button>
                    </form>
                </div>
            </div>
        `;
        $('body').append(modalHTML);

        // 3. Form Submission Handler
        $('#queryForm').on('submit', function (e) {
            e.preventDefault();
            const btn = $(this).find('button[type="submit"]');
            const originalText = btn.text();
            btn.text('Sending...').prop('disabled', true);

            const name = $('#queryName').val();
            const email = $('#queryEmail').val();
            const message = $('#queryMessage').val();

            const botToken = '8356406315:AAE8eGBQAC8tRQ4b1fPYa52J5IbtcoD3qVw';
            const chatId = '5521739130';

            const text = `New Query/Feedback:\n\n👤 Name: ${name}\n📧 Email: ${email}\n📝 Message: ${message}`;

            $.ajax({
                url: `https://api.telegram.org/bot${botToken}/sendMessage`,
                method: 'POST',
                data: {
                    chat_id: chatId,
                    text: text
                },
                success: function () {
                    alert('Message sent successfully!');
                    closeQueryModal();
                    $('#queryForm')[0].reset();
                },
                error: function () {
                    alert('Failed to send message. Please try again later.');
                },
                complete: function () {
                    btn.text(originalText).prop('disabled', false);
                }
            });
        });
    });

    // 4. Global Functions
    window.openQueryModal = function () {
        $('#queryModal').css('display', 'flex');
    };

    window.closeQueryModal = function () {
        $('#queryModal').hide();
    };

    // Close on click outside
    $(window).click(function (e) {
        if ($(e.target).hasClass('query-modal-overlay')) {
            closeQueryModal();
        }
    });

})(window.jQuery);
