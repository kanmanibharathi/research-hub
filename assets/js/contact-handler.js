/**
 * Research Hub - Contact Form Handler
 * Sends contact messages to a Telegram Bot
 */

$(document).ready(function () {
    const contactForm = $('form#contact');

    if (contactForm.length) {
        contactForm.off('submit').on('submit', function (e) {
            e.preventDefault();

            // NEW BOT CREDENTIALS
            const botToken = '8535536572:AAHx6MAn9pSaLJjl1PdjIACKJWuSKOz6fu8';
            const chatId = '5521739130';

            const submitBtn = $('#form-submit');
            const originalBtnText = submitBtn.text();

            // Collect Data
            const name = $('#name').val();
            const email = $('#email').val();
            const subject = $('#subject').val();
            const message = $('#message').val();

            // Format Telegram Message
            const text = `New Contact Form Submission:\n\n👤 Name: ${name}\n📧 Email: ${email}\n📌 Subject: ${subject}\n📝 Message: ${message}`;

            // UI: Show loading state
            submitBtn.prop('disabled', true).text('Sending...');

            // Process submission to Telegram using jQuery AJAX
            $.ajax({
                url: `https://api.telegram.org/bot${botToken}/sendMessage`,
                method: 'POST',
                data: {
                    chat_id: chatId,
                    text: text
                },
                success: function () {
                    alert('Message sent successfully!');
                    contactForm[0].reset();
                },
                error: function (xhr, status, error) {
                    console.error('Telegram Error:', error);
                    alert('Failed to send message. Please try again later.');
                },
                complete: function () {
                    submitBtn.text(originalBtnText).prop('disabled', false);
                }
            });
        });
    }
});
