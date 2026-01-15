(function ($) {

    "use strict";

    $(window).scroll(function () {
        var scroll = $(window).scrollTop();
        var box = $('.header-text').height();
        var header = $('header').height();

        if (scroll >= box - header) {
            $("header").addClass("background-header");
        } else {
            $("header").removeClass("background-header");
        }
    });

    // Safeguard isotope
    if ($('.grid').length && $.fn.isotope) {
        $('.filters ul li').click(function () {
            $('.filters ul li').removeClass('active');
            $(this).addClass('active');

            var data = $(this).attr('data-filter');
            $grid.isotope({
                filter: data
            })
        });

        var $grid = $(".grid").isotope({
            itemSelector: ".all",
            percentPosition: true,
            masonry: {
                columnWidth: ".all"
            }
        });
    }


    const Accordion = {
        settings: {
            // Expand the first item by default
            first_expanded: false,
            // Allow items to be toggled independently
            toggle: false
        },

        openAccordion: function (toggle, content) {
            if (content.children.length) {
                toggle.classList.add("is-open");
                let final_height = Math.floor(content.children[0].offsetHeight);
                content.style.height = final_height + "px";
            }
        },

        closeAccordion: function (toggle, content) {
            toggle.classList.remove("is-open");
            content.style.height = 0;
        },

        init: function (el) {
            const _this = this;

            // Override default settings with classes
            let is_first_expanded = _this.settings.first_expanded;
            if (el.classList.contains("is-first-expanded")) is_first_expanded = true;
            let is_toggle = _this.settings.toggle;
            if (el.classList.contains("is-toggle")) is_toggle = true;

            // Loop through the accordion's sections and set up the click behavior
            const sections = el.getElementsByClassName("accordion");
            const all_toggles = el.getElementsByClassName("accordion-head");
            const all_contents = el.getElementsByClassName("accordion-body");
            for (let i = 0; i < sections.length; i++) {
                const section = sections[i];
                const toggle = all_toggles[i];
                const content = all_contents[i];

                // Click behavior
                toggle.addEventListener("click", function (e) {
                    if (!is_toggle) {
                        // Hide all content areas first
                        for (let a = 0; a < all_contents.length; a++) {
                            _this.closeAccordion(all_toggles[a], all_contents[a]);
                        }

                        // Expand the clicked item
                        _this.openAccordion(toggle, content);
                    } else {
                        // Toggle the clicked item
                        if (toggle.classList.contains("is-open")) {
                            _this.closeAccordion(toggle, content);
                        } else {
                            _this.openAccordion(toggle, content);
                        }
                    }
                });

                // Expand the first item
                if (i === 0 && is_first_expanded) {
                    _this.openAccordion(toggle, content);
                }
            }
        }
    };

    (function () {
        // Initiate all instances on the page
        const accordions = document.getElementsByClassName("accordions");
        for (let i = 0; i < accordions.length; i++) {
            Accordion.init(accordions[i]);
        }
    })();


    if ($.fn.owlCarousel) {
        $('.owl-service-item').owlCarousel({
            items: 3,
            loop: true,
            dots: true,
            nav: true,
            autoplay: true,
            margin: 30,
            responsive: {
                0: {
                    items: 1
                },
                600: {
                    items: 2
                },
                1000: {
                    items: 3
                }
            }
        })

        $('.owl-courses-item').owlCarousel({
            items: 4,
            loop: true,
            dots: true,
            nav: true,
            autoplay: true,
            margin: 30,
            responsive: {
                0: {
                    items: 1
                },
                600: {
                    items: 2
                },
                1000: {
                    items: 4
                }
            }
        })

        $('.owl-clients-item').owlCarousel({
            items: 5,
            loop: true,
            dots: false,
            nav: false,
            autoplay: true,
            autoplayTimeout: 3000,
            margin: 30,
            responsive: {
                0: {
                    items: 1
                },
                600: {
                    items: 3
                },
                1000: {
                    items: 5
                }
            }
        })
    }


    // Menu Dropdown Toggle
    if ($('.menu-trigger').length) {
        $(".menu-trigger").on('click', function () {
            $(this).toggleClass('active');
            $('.header-area .nav').slideToggle(200);
        });
    }


    // Menu elevator animation
    $('.scroll-to-section a[href*=\\#]:not([href=\\#])').on('click', function () {
        if (location.pathname.replace(/^\//, '') == this.pathname.replace(/^\//, '') && location.hostname == this.hostname) {
            var target = $(this.hash);
            target = target.length ? target : $('[name=' + this.hash.slice(1) + ']');
            if (target.length) {
                var width = $(window).width();
                if (width < 991) {
                    $('.menu-trigger').removeClass('active');
                    $('.header-area .nav').slideUp(200);
                }
                $('html,body').animate({
                    scrollTop: (target.offset().top) - 80
                }, 700);
                return false;
            }
        }
    });

    $(document).ready(function () {
        $(document).on("scroll", onScroll);

        //smoothscroll
        $('.scroll-to-section a[href^="#"]').on('click', function (e) {
            e.preventDefault();
            $(document).off("scroll");

            $('.scroll-to-section a').each(function () {
                $(this).removeClass('active');
            })
            $(this).addClass('active');

            var target = this.hash,
                menu = target;
            var target = $(this.hash);
            $('html, body').stop().animate({
                scrollTop: (target.offset().top) - 79
            }, 500, 'swing', function () {
                window.location.hash = target;
                $(document).on("scroll", onScroll);
            });
        });
    });

    function onScroll(event) {
        var scrollPos = $(document).scrollTop();
        $('.nav a').each(function () {
            var currLink = $(this);
            var href = currLink.attr("href");
            if (href && href.startsWith("#") && href.length > 1) {
                var refElement = $(href);
                if (refElement.length && refElement.position().top <= scrollPos && refElement.position().top + refElement.height() > scrollPos) {
                    $('.nav ul li a').removeClass("active");
                    currLink.addClass("active");
                }
                else if (refElement.length) {
                    currLink.removeClass("active");
                }
            }
        });
    }


    // Page loading animation
    $(window).on('load', function () {
        if ($('.cover').length && $.fn.parallax) {
            $('.cover').parallax({
                imageSrc: $('.cover').data('image'),
                zIndex: '1'
            });
        }

        $("#preloader").animate({
            'opacity': '0'
        }, 600, function () {
            setTimeout(function () {
                $("#preloader").css("visibility", "hidden").fadeOut();
            }, 300);
        });
    });

    // Global Link Masking to prevent status bar URL previews (bottom-left path display)
    $(document).ready(function () {
        // Event delegation for all current and future links
        $(document).on('mouseover', 'a', function () {
            var $link = $(this);
            var href = $link.attr('href');

            // Only mask real links that aren't already masked or simple anchors
            if (href && !href.startsWith('javascript:') && !href.startsWith('#') && !$link.attr('data-masked')) {
                $link.attr('data-href', href);
                $link.attr('data-masked', 'true');
                $link.attr('href', 'javascript:void(0)');

                $link.on('click', function (e) {
                    // Don't intercept if it's a dropdown toggle (handled separately)
                    if ($link.parent().hasClass('has-sub') || $link.hasClass('menu-trigger')) {
                        return;
                    }

                    e.preventDefault();
                    var url = $link.attr('data-href');
                    var target = $link.attr('target');

                    if (target === '_blank') {
                        window.open(url, '_blank');
                    } else {
                        window.location.href = url;
                    }
                });
            }
        });
    });


    const dropdownOpener = $('.main-nav ul.nav .has-sub > a');

    // Open/Close Submenus
    if (dropdownOpener.length) {
        dropdownOpener.each(function () {
            var _this = $(this);

            _this.on('tap click', function (e) {
                var thisItemParent = _this.parent('li'),
                    thisItemParentSiblingsWithDrop = thisItemParent.siblings('.has-sub');

                if (thisItemParent.hasClass('has-sub')) {
                    var submenu = thisItemParent.find('> ul.sub-menu');

                    if (submenu.is(':visible')) {
                        submenu.slideUp(450, 'easeInOutQuad');
                        thisItemParent.removeClass('is-open-sub');
                    } else {
                        thisItemParent.addClass('is-open-sub');

                        if (thisItemParentSiblingsWithDrop.length === 0) {
                            thisItemParent.find('.sub-menu').slideUp(400, 'easeInOutQuad', function () {
                                submenu.slideDown(250, 'easeInOutQuad');
                            });
                        } else {
                            thisItemParent.siblings().removeClass('is-open-sub').find('.sub-menu').slideUp(250, 'easeInOutQuad', function () {
                                submenu.slideDown(250, 'easeInOutQuad');
                            });
                        }
                    }
                }

                e.preventDefault();
            });
        });
    }


    function visible(partial) {
        var $t = partial,
            $w = jQuery(window),
            viewTop = $w.scrollTop(),
            viewBottom = viewTop + $w.height(),
            _top = $t.offset().top,
            _bottom = _top + $t.height(),
            compareTop = partial === true ? _bottom : _top,
            compareBottom = partial === true ? _top : _bottom;

        return ((compareBottom <= viewBottom) && (compareTop >= viewTop) && $t.is(':visible'));

    }

    $(window).scroll(function () {

        if (visible($('.count-digit'))) {
            if ($('.count-digit').hasClass('counter-loaded')) return;
            $('.count-digit').addClass('counter-loaded');

            $('.count-digit').each(function () {
                var $this = $(this);
                jQuery({
                    Counter: 0
                }).animate({
                    Counter: $this.text()
                }, {
                    duration: 3000,
                    easing: 'swing',
                    step: function () {
                        $this.text(Math.ceil(this.Counter));
                    }
                });
            });
        }
    })

})(window.jQuery);

(function ($) {
    $(document).ready(function () {
        // 1. Inject CSS
        const modalStyles = `
            <style>
                .query-modal-overlay {
                    display: none;
                    position: fixed;
                    top: 0;
                    right: 0;
                    bottom: 0;
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
                .query-modal-close:hover {
                    color: #d63384;
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
