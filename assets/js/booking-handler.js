/**
 * Research Hub - Booking Form Handler
 * Handles the submission of consultation requests to Google Sheets
 * and manages the UI feedback (loading states, success messages).
 */

$(document).ready(function () {
    const consultationForm = $('#consultationForm');
    const countryCodeSelect = $('#country_code');
    const timezoneInfo = $('#timezone-info');

    // --- Timezone Detection Logic ---
    function updateTimezoneDisplay() {
        const selectedOption = countryCodeSelect.find('option:selected');
        const countryName = selectedOption.text().split('(')[1]?.split(')')[0] || "Selected Country";

        // Use Intl to get formatting for a better "WOW" factor
        try {
            const now = new Date();
            const timeString = now.toLocaleTimeString('en-US', {
                timeZoneName: 'short',
                // If data-tz is provided, use it, otherwise fallback to local
                timeZone: selectedOption.data('tz') || undefined
            });
            const zoneName = timeString.split(' ').pop();
            timezoneInfo.html(`<i class="fa fa-clock-o"></i> Showing time as per ${countryName} (${zoneName})`);
        } catch (e) {
            timezoneInfo.text(`Timezone: ${countryName} Local Time`);
        }
    }

    if (countryCodeSelect.length) {
        countryCodeSelect.on('change', updateTimezoneDisplay);
        updateTimezoneDisplay(); // Initialize on load
    }

    if (consultationForm.length) {
        consultationForm.on('submit', function (e) {
            e.preventDefault();

            // UPDATED URL provided by User
            const scriptURL = 'https://script.google.com/macros/s/AKfycbzfKILjvy2kCpnavklpdAiDP2YkjcJ6uxzSxbxV9f31q6FPB4LSa06Ukax4rG1TEeo8/exec';

            const submitBtn = $('#submitBtn');
            const successMessage = $('#success-message');

            // 1. Convert FormData to a Plain Object for JSON serialization
            const formData = new FormData(this);
            const dataObject = {};
            formData.forEach((value, key) => {
                dataObject[key] = value;
            });

            // 2. Append the required Security Token (matching the GAS script)
            dataObject['action_token'] = 'RH_SECURE_VERIFY_2026';

            // UI: Show loading state
            submitBtn.prop('disabled', true).html('<i class="fa fa-spinner fa-spin"></i> Submitting...');

            // 3. Send as a JSON String (because your GAS uses JSON.parse(e.postData.contents))
            // We use 'text/plain' (implicitly or explicitly) to avoid CORS Preflight checks for simple requests
            fetch(scriptURL, {
                method: 'POST',
                mode: 'no-cors', // 'no-cors' allows the request to be sent but prevents reading the response (opaque)
                headers: {
                    'Content-Type': 'text/plain'
                },
                body: JSON.stringify(dataObject)
            })
                .then(response => {
                    // UI: Show success feedback
                    consultationForm.fadeOut(500, function () {
                        successMessage.fadeIn();
                    });

                    // Scroll to the feedback message
                    $('html, body').animate({
                        scrollTop: $(".booking-form-container").offset().top - 100
                    }, 1000);
                })
                .catch(error => {
                    console.error('Submission Error:', error);
                    alert('Submission failed. Please check your internet connection or contact us via WhatsApp directly.');

                    // UI: Reset button state
                    submitBtn.prop('disabled', false).text('👉 Book Consultation / Submit Request');
                });
        });
    }
});
