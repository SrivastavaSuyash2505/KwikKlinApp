/* Kwik Klin — Solo owner mode (staff app ke upar). routers/solo_owner.py ke saath.
 *
 * Ek aadmi, ek phone. Screens: आज · ऑर्डर · ➕ बिल (staff app ka) · उधार · आप
 * (rate card, dukaan, plan, bhasha). "आज" par 5 kaam (docs/PRODUCT_PLAN_SOLO_
 * WASHERMAN.md §4): नया बिल · ऑर्डर · ग्राहक · उधार · आज की बिक्री, aur plan /
 * AI jawab ka card. Grahak, aaj ki bikri aur report alag screens. staff.js ke globals (api, $, esc, money,
 * toast, busy, openModal, ME, go, FILTER, deliverModal, messageMenu, askCollect,
 * remindBill, orderDetailModal, changePw) yahin se use hote hain — ye file
 * staff.js ke BAAD load hoti hai. Koi inline handler nahi (CSP).
 *
 * Bhasha: ME.ui_lang ("hi" default solo mein). T(key) — dono table niche.
 */
(function () {
  "use strict";

  const S = {
    nav_home: ["आज", "Today"], nav_orders: ["ऑर्डर", "Orders"], nav_new: ["बिल", "Bill"],
    nav_dues: ["उधार", "Dues"], nav_me: ["आप", "You"],
    bills_today: ["आज के बिल", "Bills today"], billed: ["आज की बिक्री", "Billed today"],
    ready: ["तैयार", "Ready"], udhaar: ["कुल उधार", "Total dues"], active: ["चालू ऑर्डर", "Active orders"],
    customers: ["ग्राहक", "customers"], late: ["लेट", "late"], month: ["इस महीने", "This month"],
    due_now: ["आज देने हैं", "Due today"], none_due: ["आज कुछ देना नहीं है", "Nothing due today"],
    ready_list: ["तैयार, ग्राहक को देने हैं", "Ready for the customer"], all_clear: ["सब साफ़ 👍", "All clear 👍"],
    chip_active: ["चालू", "Active"], chip_received: ["आए", "Received"], chip_washing: ["धुल रहे", "Washing"],
    chip_ready: ["तैयार", "Ready"], chip_done: ["दे दिए", "Delivered"], chip_cancelled: ["कैंसिल", "Cancelled"],
    search: ["बिल नंबर या नाम", "Bill number or name"], no_orders: ["कोई ऑर्डर नहीं", "No orders"],
    more: ["और दिखाएँ", "Show more"], deliver: ["दे दिया", "Delivered"], msg: ["💬", "💬"],
    due: ["बाकी", "due"], paid: ["चुकता", "paid"], delivery: ["देना", "due"], today: ["आज", "today"],
    tomorrow: ["कल", "tomorrow"], ago: ["दिन पुराना", "days old"],
    IN_WASH: ["धुलाई शुरू", "Start wash"], IN_DRY: ["सुखाने", "To dry"], IN_IRON: ["प्रेस", "To iron"],
    READY: ["तैयार हो गया", "Mark ready"], OUT_FOR_DELIVERY: ["डिलीवरी पर", "Out for delivery"],
    DELIVERED: ["दे दिया", "Delivered"], PICKED_UP: ["उठा लिया", "Picked up"],
    dues_total: ["कुल उधार", "Total dues"], dues_none: ["किसी का उधार बाकी नहीं 🎉", "No dues pending 🎉"],
    bills_n: ["बिल", "bills"], remind: ["🔔 याद दिलाओ", "🔔 Remind"], got_money: ["💵 पैसा आया", "💵 Got paid"],
    opted_out: ["मैसेज बंद", "messages off"],
    rate_card: ["रेट कार्ड", "Rate card"], shop: ["दुकान", "Shop"], plan: ["प्लान", "Plan"],
    lang: ["हिंदी → English", "English → हिंदी"], pw: ["पासवर्ड बदलें", "Change password"],
    logout: ["लॉगआउट", "Logout"], owner: ["मालिक", "Owner"],
    add_item: ["+ आइटम जोड़ें", "+ Add item"], per_kg: ["प्रति किलो", "per kg"], off: ["बंद", "off"],
    on: ["चालू", "on"], saved: ["सेव हो गया", "Saved"], rate_hint: ["रेट बदलो — नए बिल पर लगेगा", "Change a rate — new bills use it"],
    service: ["सर्विस", "Service"], svc_other: ["और कोई (लिखें)", "Something else (type it)"], item: ["कपड़ा", "Item"], rate: ["रेट ₹", "Rate ₹"], unit: ["हिसाब", "Unit"],
    piece: ["पीस", "piece"], kg: ["किलो", "kg"], save: ["सेव", "Save"], cancel: ["रहने दो", "Cancel"],
    shop_name: ["दुकान का नाम", "Shop name"], owner_name: ["आपका नाम", "Your name"], address: ["पता", "Address"],
    phone: ["दुकान का फ़ोन", "Shop phone"], upi: ["UPI ID (पैसा लेने के लिए)", "UPI ID (to get paid)"],
    upi_name: ["UPI पर नाम", "Name on UPI"], footer: ["बिल के नीचे की लाइन", "Line at the bottom of the bill"],
    wa: ["WhatsApp", "WhatsApp"], wa_on: ["जुड़ा है ✅ ग्राहक को बिल और मैसेज अपने आप जाते हैं", "Connected ✅ bills and updates go to customers automatically"],
    wa_off: ["अभी नहीं जुड़ा। जुड़ने पर बिल, 'तैयार है' और उधार की याद अपने आप जाएगी।", "Not connected yet. Once connected, bills, 'ready' and due reminders go automatically."],
    wa_req: ["जोड़ने की दरख़्वास्त भेज दी — हम आपसे संपर्क करेंगे", "Request sent — we will contact you"],
    wa_btn: ["मेरा WhatsApp जोड़ो", "Connect my WhatsApp"], wa_home: ["डैशबोर्ड → Settings से जोड़ें", "Connect from Dashboard → Settings"],
    offer_tag: ["ऑफ़र", "Offer"], offer_after: ["ट्रायल के बाद", "After the trial"], offer_month: ["महीना", "month"],
    offer_first: ["पहली बार", "First payment"], offer_setup: ["एक बार सेटअप समेत", "includes one-time setup"],
    offer_then: ["फिर हर महीने", "then every month"], offer_take: ["प्लान लें", "Get the plan"],
    offer_more: ["और ज़्यादा चाहिए?", "Want more?"], offer_see: ["देखें", "See plans"], later: ["बाद में", "Later"], close: ["बंद करें", "Close"],
    pop_trial: ["आपका ट्रायल ख़त्म होने वाला है", "Your free trial is ending"], pop_plan: ["आपका प्लान ख़त्म होने वाला है", "Your plan is ending"],
    pop_hint: ["प्लान ले लें ताकि बिल और मैसेज चलते रहें। आपका सारा डेटा सुरक्षित है।", "Pick a plan so bills and messages keep going. Your data is safe."],
    plan_trial: ["ट्रायल", "Trial"], plan_till: ["तक", "until"], orders_m: ["इस महीने ऑर्डर", "Orders this month"],
    ai_m: ["AI जवाब", "AI replies"], wa_m: ["WhatsApp मैसेज", "WhatsApp messages"], of: ["में से", "of"],
    ai_work: ["इस महीने AI ने", "AI this month"], w_replies: ["जवाब", "replies"], w_pickups: ["पिकअप बुक", "pickups booked"],
    pp_trial: ["ट्रायल में Solo Pro की सुविधाएँ खुली हैं। ट्रायल के बाद ये Solo Pro में ही मिलेंगी।", "Solo Pro features are open during your trial. After the trial they come with Solo Pro."],
    up_title: ["हर महीने", "Every month"], up_replies: ["AI जवाब", "AI replies"], up_cta: ["प्लान देखें", "See plan"], up_or: ["या रिचार्ज करें", "Or recharge"],
    up_line_a: ["इस महीने AI ने", "AI sent"], up_line_b: ["जवाब दिए।", "replies this month."], up_line_c: ["में हर महीने", "gives you"], up_line_d: ["जवाब मिलते हैं।", "replies a month."],
    w_follow: ["फ़ॉलो-अप", "follow-ups"], w_photos: ["फ़ोटो पढ़े", "photos read"], w_staff: ["स्टाफ़ की मदद", "staff helped"],
    upgrade: ["अगला प्लान", "Next plan"], packs: ["रिचार्ज", "Recharge"], billing: ["प्लान / पेमेंट (डैशबोर्ड)", "Plan / payment (dashboard)"],
    ob_title: ["5 मिनट में दुकान तैयार", "Your shop, ready in 5 minutes"],
    ob_1: ["1. दुकान", "1. Shop"], ob_2: ["2. क्या-क्या करते हैं?", "2. What do you do?"], ob_3: ["3. WhatsApp", "3. WhatsApp"],
    ob_svc_hint: ["चुनो — आम कपड़ों के रेट अपने आप भर जाएँगे, बाद में बदल लेना", "Pick — common items get typical rates, change them later"],
    ob_kg: ["किलो के हिसाब से भी", "Also per kg"], next: ["आगे", "Next"], skip: ["बाद में", "Later"],
    done: ["हो गया 🎉", "Done 🎉"], ob_done_hint: ["पहला बिल बनाओ — ग्राहक का नंबर, कपड़े, सेव", "Make your first bill — number, clothes, save"],
    help: ["मदद", "Help"],
    act_orders: ["ऑर्डर", "Orders"], act_customers: ["ग्राहक", "Customers"], act_dues: ["उधार", "Pending payments"],
    act_sales: ["आज की बिक्री", "Today's sales"], n_active: ["चालू", "active"], n_ready: ["तैयार", "ready"],
    n_customers: ["ग्राहक", "customers"], collected: ["आया पैसा", "Collected"], new_dues: ["नया उधार", "New dues"],
    ai_card: ["AI जवाब", "AI replies"], ai_left: ["बाकी", "left"], ai_refill: ["को फिर से भरेंगे", "refills on"],
    ai_on: ["चालू", "On"], ai_warn: ["कम बचे हैं", "Running low"], ai_limit: ["इस महीने के ख़त्म", "Limit reached"],
    ai_paused: ["रुके हुए", "Paused"], ai_off: ["आपने बंद किए", "Turned off"],
    ai_limit_hint: ["AI जवाब इस महीने के ख़त्म — ग्राहकों के मैसेज Inbox में हैं, खुद जवाब दें। बिल बनाना चालू है।",
      "AI replies are used up this month — customer messages wait in the Inbox; reply yourself. Billing still works."],
    ai_paused_hint: ["इस प्लान पर AI जवाब अभी रुके हैं। बिल और मैसेज चालू हैं।", "AI replies are paused on this plan. Bills and your own messages still work."],
    ai_off_hint: ["AI जवाब बंद हैं — ग्राहक के मैसेज का जवाब आप देते हैं।", "AI replies are off — you answer customer messages."],
    ai_warn_hint: ["AI जवाब कम बचे हैं। ख़त्म होने पर भी बिल बनाना चालू रहेगा।", "AI replies are running low. Billing keeps working even when they run out."],
    cadd: ["ग्राहक जोड़ें", "Add customers"], cadd_pick: ["फ़ोन के कॉन्टैक्ट से चुनें", "Choose from phone contacts"],
    cadd_pick_hint: ["एक साथ कई चुन सकते हैं", "You can pick many at once"],
    cadd_name: ["नाम", "Name"], cadd_phone: ["मोबाइल नंबर", "Mobile number"], cadd_address: ["पता (ज़रूरी नहीं)", "Address (optional)"],
    cadd_more: ["एक और जोड़ें", "Add one more"], cadd_save: ["जोड़ें", "Add"], cadd_saving: ["जोड़ रहे हैं…", "Adding…"],
    cadd_remove: ["हटाएँ", "Remove"], cadd_need: ["नाम और मोबाइल नंबर भरें", "Fill in name and mobile number"],
    cadd_bad: ["इनका नाम या नंबर ठीक करें", "Fix the name or number of these"],
    cadd_done: ["ग्राहक जुड़े", "customers added"], cadd_same: ["पहले से हैं", "already saved"],
    cadd_first: ["+ बटन से अपने ग्राहक जोड़ें", "Add your customers with the + button"], cadd_new: ["नया", "New"],
    cust_search: ["नाम या नंबर", "Name or number"], no_customers: ["अभी कोई ग्राहक नहीं", "No customers yet"],
    spent: ["कुल", "Total"], days_ago: ["दिन पहले", "days ago"], last_today: ["आज आए", "came today"],
    paid_amt: ["दिया", "Paid"], payments: ["पैसा मिला", "Payments"], since: ["से ग्राहक", "customer since"],
    no_bills_today: ["आज अभी कोई बिल नहीं", "No bills yet today"], by_method: ["कैसे आया", "How it came"],
    CASH: ["नकद", "Cash"], UPI: ["UPI", "UPI"], CARD: ["कार्ड", "Card"], OTHER: ["और", "Other"],
    reports: ["रिपोर्ट", "Report"], this_month: ["इस महीने", "This month"], last_month: ["पिछला महीना", "Last month"],
    rep_bills: ["बिल", "Bills"], rep_billed: ["बिक्री", "Sales"], rep_avg: ["औसत बिल", "Average bill"],
    rr_title: ["किसी भी तारीख़ का हिसाब", "Any dates"], rr_from: ["से", "From"], rr_to: ["तक", "To"],
    rr_show: ["दिखाएँ", "Show"], rr_bills: ["बिल बने", "Bills made"], rr_recv: ["आया पैसा", "Received"],
    rr_new: ["इन बिलों का", "These bills"], rr_old: ["पुराने बिलों का", "Older bills"],
    rr_due: ["इन बिलों का बाकी", "Still to collect"], rr_exp: ["ख़र्चा", "Expenses"], rr_profit: ["मुनाफ़ा", "Profit"],
    rr_note: ["बिक्री = इन दिनों बने बिल; आया पैसा = इन दिनों मिला पैसा, बिल कभी का हो — पुराना उधार आया तो बिक्री से ज़्यादा भी हो सकता है।",
      "Sales = bills made in these days; Received = money that came in these days, for any bill — old dues paid can make it more than Sales."],
    rep_newc: ["नए ग्राहक", "New customers"], rep_dues: ["कुल उधार (आज तक)", "Total dues (now)"],
    rep_by_service: ["सर्विस के हिसाब से", "By service"], rep_top: ["सबसे बड़े ग्राहक", "Top customers"],
    rep_daily: ["रोज़ की बिक्री", "Day by day"],
    rep_pro: ["पूरी रिपोर्ट Solo Pro में — सर्विस के हिसाब से, बड़े ग्राहक, रोज़ की बिक्री", "Full report in Solo Pro — by service, top customers, day by day"],
    ai_lapsed: ["प्लान ख़त्म — बंद", "Plan ended — off"],
    ends_in: ["दिन में प्लान ख़त्म", "days left on your plan"], ends_today: ["आज प्लान ख़त्म", "Your plan ends today"],
    lapse_new: ["प्लान ख़त्म — नया बिल नहीं बनेगा। चालू ऑर्डर पूरे करें, पैसा लें, मैसेज भेजें। सारा डेटा सुरक्षित है।",
      "Plan ended — no new bills. Finish open orders, collect money and message customers. All your data is safe."],
    lapse_view: ["प्लान ख़त्म — ऐप अभी सिर्फ़ देखने के लिए है। आपका सारा डेटा सुरक्षित है, कुछ नहीं मिटा।",
      "Plan ended — the app is view-only for now. All your data is safe; nothing was deleted."],
    renew: ["प्लान चालू करें", "Renew plan"], buy_title: ["प्लान लें / चालू करें", "Get or renew a plan"],
    monthly: ["महीना", "Monthly"], yearly: ["साल · 2 महीने मुफ़्त", "Yearly · 2 months free"],
    per_day: ["रोज़ का", "a day"], per_year: ["साल", "year"], per_month: ["महीना", "month"],
    wa_lite: ["Solo Lite में बिल आपके अपने WhatsApp से जाता है (होम पर \"भेजने हैं\")। ग्राहक को अपने-आप मैसेज और AI जवाब के लिए Solo Starter लें।",
      "On Solo Lite, bills go from your own WhatsApp (\"To send\" on home). For automatic messages and AI replies, get Solo Starter."],
    wa_lite_up: ["Solo Starter देखें", "See Solo Starter"],
    b_plan: ["प्लान", "Plan"], b_setup: ["एक बार सेटअप", "One-time setup"], b_gst: ["GST", "GST"], b_total: ["कुल", "Total"],
    pay_now: ["भरें", "Pay"], pay_off: ["हमें WhatsApp करें — पेमेंट होते ही आपका प्लान चालू कर देंगे।", "Message us on WhatsApp — your plan turns on once the payment is done."], buy_wa: ["WhatsApp पर प्लान लें", "Get the plan on WhatsApp"],
    pay_opened: ["पेमेंट पेज खुल गया — पेमेंट होते ही प्लान अपने आप चालू हो जाएगा।", "Payment page opened — your plan turns on by itself once the payment goes through."],
    pay_note: ["पेमेंट Razorpay से — UPI, कार्ड, नेटबैंकिंग। हर महीने अपने आप।", "Paid via Razorpay — UPI, card, netbanking. Renews by itself."],
    wa_connect_title: ["अपना WhatsApp जोड़ें", "Connect your WhatsApp"], wa_number: ["आपका WhatsApp नंबर", "Your WhatsApp number"],
    wa_get_code: ["जोड़ने का कोड लें", "Get the link code"],
    wa_code_steps: ["अपने फ़ोन पर WhatsApp खोलें → ⋮ → Linked devices → Link a device → \"Link with phone number instead\" → यह कोड डालें:",
      "On your phone open WhatsApp → ⋮ → Linked devices → Link a device → \"Link with phone number instead\" → enter this code:"],
    wa_waiting: ["जुड़ने का इंतज़ार…", "Waiting for WhatsApp…"], wa_show_qr: ["QR दिखाएँ (दूसरे फ़ोन या लैपटॉप से स्कैन)", "Show QR (scan from another phone or laptop)"], wa_qr_wait: ["QR बन रहा है…", "QR is getting ready…"],
    loc_map: ["मैप खोलें", "Open map"], loc_save: ["यहीं की लोकेशन सेव करें", "Save location here"], loc_update: ["लोकेशन बदलें", "Update location"], loc_remove: ["लोकेशन हटाएँ", "Remove location"],
    loc_none: ["अभी लोकेशन नहीं है — ग्राहक WhatsApp पर भेजेगा तो यहाँ दिखेगी।", "No location yet — it shows here when the customer sends it on WhatsApp."],
    ai_trial_a: ["ट्रायल के जवाब · प्लान लेने पर", "Trial replies · with a plan"], ai_trial_b: ["हर महीने", "every month"],
    rc_limit: ["AI जवाब ख़त्म हो गए", "AI replies are used up"], rc_warn: ["AI जवाब ख़त्म होने वाले हैं", "AI replies are running out"],
    rc_trial: ["ट्रायल के AI जवाब ख़त्म", "Trial AI replies are used up"],
    rc_hint: ["रिचार्ज लें ताकि ग्राहकों को जवाब मिलते रहें।", "Recharge so customers keep getting replies."],
    rc_trial_hint: ["प्लान लेने पर हर महीने AI जवाब मिलेंगे। बिल बनाना चालू है।", "A plan gives you AI replies every month. Billing still works."],
    rc_note_live: ["पैक पर दबाएँ, पेमेंट पेज खुलेगा। पेमेंट होते ही बैलेंस अपने आप जुड़ जाएगा।", "Tap a pack and pay. Your balance is added by itself."],
    pk_ai: ["AI जवाब", "AI replies"], pk_wa: ["WhatsApp मैसेज", "WhatsApp messages"],
    rc_note: ["पैक पर दबाएँ — WhatsApp खुलेगा, पेमेंट होते ही रिचार्ज जुड़ जाएगा।", "Tap a pack — WhatsApp opens, and the recharge is added once paid."],
    ai_recharge: ["रिचार्ज", "recharge"], wa_down: ["आपका WhatsApp बंद है", "Your WhatsApp is disconnected"], wa_down_tap: ["अभी दोबारा जोड़ें", "Connect it again"],
    wa_no_code: ["कोड नहीं बन पाया — नीचे QR से जोड़ें, या एक मिनट बाद फिर कोशिश करें।", "Couldn't get a code — use the QR below, or try again in a minute."],
    wa_connected_as: ["जुड़ा है ✅", "Connected ✅"], wa_remove: ["WhatsApp हटाएँ", "Disconnect WhatsApp"],
    wa_remove_q: ["पक्का हटाना है? ग्राहकों को अपने आप मैसेज जाने बंद हो जाएँगे।", "Disconnect? Automatic messages to customers will stop."],
    wa_own_note: ["बिल, 'तैयार है' और जवाब आपके अपने नंबर से जाएँगे — किसी और के नंबर से नहीं।", "Bills, 'ready' updates and replies go from your own number — never anyone else's."],
    wa_not_now: ["अभी नहीं जुड़ा — बिल \"Share\" से भेज सकते हैं।", "Not connected yet — you can still send bills with Share."],
    wa_lost: ["आपका WhatsApp अभी चालू नहीं है — नीचे से दोबारा जोड़ें। तब तक ग्राहक के मैसेज 'भेजने हैं' में आएँगे।", "Your WhatsApp is not working right now — connect it again below. Until then customer messages wait in your send list."],
    sends_n: ["मैसेज भेजने हैं", "messages to send"], sends_tap: ["एक टैप में अपने WhatsApp से भेजें", "Send from your own WhatsApp in one tap"],
    sends_title: ["भेजने हैं", "To send"], sends_hint: ["आपका WhatsApp अभी नहीं जुड़ा, इसलिए ये मैसेज अपने आप नहीं गए। \"भेजो\" दबाएँ — WhatsApp में नंबर और मैसेज भरा हुआ खुलेगा, बस Send दबाएँ।",
      "Your WhatsApp isn't connected, so these didn't go automatically. Tap \"Send\" — WhatsApp opens with the number and message filled in; just press Send."],
    sends_go: ["📤 भेजो", "📤 Send"], sends_skip: ["छोड़ो", "Skip"], sends_none: ["कोई मैसेज बाकी नहीं 👍", "Nothing left to send 👍"],
    sends_connect: ["WhatsApp जोड़ें — फिर ये अपने आप जाएँगे", "Connect WhatsApp — then these go by themselves"],
    install: ["फ़ोन पर ऐप इंस्टॉल करें", "Install the app on your phone"],
    yt_app: ["ऐप", "App"], yt_account: ["खाता", "Account"], yt_lang: ["भाषा", "Language"],
    pp_yest: ["कल", "Yesterday"], pp_vs: ["पिछले महीने से", "vs last month"], pp_month_vs: ["इस महीने, पिछले से", "this month vs last"],
    pp_tasks: ["आज के काम", "Today's work"], pp_clear: ["सब काम पूरे, बढ़िया! 👍", "All done, great work! 👍"],
    pp_late: ["ऑर्डर लेट हैं", "orders are late"], pp_late_s: ["पहले इन्हें पूरा करें", "Finish these first"],
    pp_ready: ["ऑर्डर तैयार हैं", "orders are ready"], pp_ready_s: ["ग्राहक को दें, पैसा लें", "Hand over and collect"],
    pp_dues: ["ग्राहकों का उधार पुराना", "customers have old dues"], pp_dues_s: ["हफ़्ते से ज़्यादा पुराना", "Older than a week"],
    pp_back: ["पुराने ग्राहक बुलाएँ", "old customers to bring back"], pp_back_s: ["एक टैप में WhatsApp", "WhatsApp in one tap"],
    pp_goal: ["इस महीने का लक्ष्य", "This month's goal"], pp_goal_set: ["लक्ष्य रखें", "Set a goal"],
    pp_goal_new: ["हर महीने की बिक्री का लक्ष्य रखें", "Set a sales goal for the month"], pp_goal_hint: ["देखें रोज़ कितना कमाना है", "See what you need each day"],
    pp_goal_q: ["इस महीने कितनी बिक्री करनी है?", "How much do you want to sell this month?"], pp_goal_remove: ["लक्ष्य हटाएँ", "Remove goal"],
    pp_goal_done: ["लक्ष्य पूरा! 🎉", "Goal reached! 🎉"], pp_goal_day: ["रोज़ चाहिए", "needed a day"], pp_days_left: ["दिन बाकी", "days left"],
    pp_back_title: ["पुराने ग्राहक", "Old customers"], pp_back_hint: ["ये 30 दिन से ज़्यादा से नहीं आए। दबाएँ — आपके WhatsApp में मैसेज भरा हुआ खुलेगा, देखकर Send करें।",
      "They haven't come in over 30 days. Tap — your WhatsApp opens with the message filled in; check it and press Send."],
    pp_back_go: ["WhatsApp पर बुलाएँ", "Invite on WhatsApp"], pp_back_none: ["अभी सब ग्राहक आ रहे हैं 👍", "All your customers are coming regularly 👍"],
    pp_since_days: ["दिन से नहीं आए", "days since last visit"], pp_share: ["हिस्सा", "share"],
    pp_dash_t: ["पूरा डैशबोर्ड", "Full dashboard"],
    pp_dash_s: ["बिल, ग्राहक, WhatsApp इनबॉक्स, ख़र्चा और रिपोर्ट — फ़ोन या लैपटॉप पर, एक ही लॉगिन।",
      "Bills, customers, WhatsApp inbox, expenses and reports — on phone or laptop, same login."],
    pp_dash_go: ["डैशबोर्ड खोलें", "Open dashboard"], pp_perk5: ["फ़ोन और लैपटॉप पर पूरा डैशबोर्ड", "Full dashboard on phone and laptop"],
    pp_perks: ["आपके प्लान में मिल रहा है", "Included in your plan"], pp_perk1: ["बिक्री का चार्ट और महीने का लक्ष्य", "Sales chart and monthly goal"],
    pp_perk2: ["पुराने ग्राहकों को एक टैप में बुलाना", "Old customers back in one tap"], pp_perk3: ["ग्राहक को ऑर्डर का लाइव स्टेटस और लोकेशन", "Live order status and customer location"],
    pp_perk4: ["पूरी रिपोर्ट: सर्विस, बड़े ग्राहक, रोज़ की बिक्री", "Full report: services, top customers, daily sales"],
  };
  const L = () => (ME && ME.ui_lang === "en" ? 1 : 0);
  const T = (k) => (S[k] ? S[k][L()] : k);
  const api2 = (p, o) => api("/owner" + p, o);
  /* Solo Pro: plan ka feature, plan ka naam nahi (custom plan bhi isi se) */
  const PRO = () => !!(ME && (ME.features || []).includes("solo_reports_detailed"));

  /* CSP (main.py) markup ke style="" rokta hai; JS se lagana chalta hai */
  function paintBars() {
    $("list").querySelectorAll("[data-w]").forEach((i) => { i.style.width = i.dataset.w + "%"; });
    $("list").querySelectorAll("[data-h]").forEach((i) => { i.style.height = i.dataset.h + "%"; });
  }

  /* ---------- nav / router ---------- */
  const NAVS = ["home", "orders", "dues", "rates", "shop", "plan", "customers", "today", "reports", "sends", "comeback"];
  function navItems() {
    return [["home", "i-dashboard", T("nav_home")], ["orders", "i-basket", T("nav_orders")],
      ["new", "i-plus", T("nav_new")], ["dues", "i-ledger", T("nav_dues")], ["me", "i-user", T("nav_me")]];
  }
  function handles(nav) { return NAVS.includes(nav); }
  function route(nav, opts = {}) {
    $("today").hidden = true;
    $("searchrow").hidden = !(nav === "orders" || nav === "customers");
    $("q").placeholder = nav === "customers" ? T("cust_search") : T("search");
    if (nav === "home") return home(opts);
    if (nav === "orders") return orders(opts);
    if (nav === "dues") return dues(opts);
    if (nav === "customers") return customers(opts);
    if (nav === "today") return todaySales(opts);
    if (nav === "reports") return reports(opts);
    if (nav === "rates") return rates();
    if (nav === "shop") return shop();
    if (nav === "plan") return plan();
    if (nav === "sends") return sends();
    if (nav === "comeback") return comeback();
  }

  /* ---------- helpers ---------- */
  const when = (iso) => {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00"), t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((d - t) / 864e5);
    if (diff === 0) return T("today");
    if (diff === 1) return T("tomorrow");
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };
  const lateCls = (iso, status) => {
    if (!iso || status === "DELIVERED") return "";
    const d = new Date(iso + "T00:00:00"), t = new Date(); t.setHours(0, 0, 0, 0);
    return d < t ? " late" : "";
  };
  function orderCard(o) {
    const nextBtn = o.next === "DELIVERED" || o.status === "READY" || o.status === "OUT_FOR_DELIVERY"
      ? `<button class="btn go sm" data-so="deliver" data-num="${esc(o.number)}">${T("DELIVERED")}</button>`
      : o.next ? `<button class="btn go sm" data-so="next" data-num="${esc(o.number)}" data-to="${esc(o.next)}">${T(o.next) === o.next ? esc(STATUS_WORD[o.next] || o.next) : T(o.next)}</button>` : "";
    return `<article class="so-card${lateCls(o.delivery, o.status)}" data-num="${esc(o.number)}">
      <div class="so-top"><b>${o.urgent ? "🔴 " : ""}${esc(o.customer)}</b>
        <span class="so-due ${o.due > 0 ? "" : "ok"}">${o.due > 0 ? money(o.due) + " " + T("due") : "✓ " + T("paid")}</span></div>
      <div class="so-sub">${esc(o.number)} · ${esc(o.items || "")}</div>
      <div class="so-sub"><span class="tag ${o.status === "READY" ? "ready" : "wash"}">${esc(STATUS_WORD[o.status] || o.status)}</span>
        ${o.delivery ? `<span class="so-when${lateCls(o.delivery, o.status)}">${T("delivery")} ${esc(when(o.delivery))}</span>` : ""}</div>
      <div class="so-acts">
        ${nextBtn}
        <button class="btn ghost sm" data-so="msg" data-num="${esc(o.number)}" data-due="${o.due}">${T("msg")}</button>
        <button class="btn ghost sm" data-so="open" data-num="${esc(o.number)}" aria-label="More">⋯</button>
      </div></article>`;
  }
  function wireCards(root, reload) {
    root.querySelectorAll("[data-so]").forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const n = b.dataset.num;
        if (b.dataset.so === "deliver") return deliverModal(n);
        if (b.dataset.so === "msg") return messageMenu(n, parseFloat(b.dataset.due || "0"));
        if (b.dataset.so === "open") return orderDetailModal(n);
        if (b.dataset.so === "next") return busy(b, async () => {
          const r = await api(`/orders/${encodeURIComponent(n)}/status`, { method: "POST", body: { status: b.dataset.to } });
          toast(`${n} → ${STATUS_WORD[r.status] || r.status}`);
          reload();
        });
      };
    });
    root.querySelectorAll(".so-card").forEach((c) => { c.onclick = () => orderDetailModal(c.dataset.num); });
  }

  /* ---------- आज ---------- */
  async function home(opts = {}) {
    $("chips").innerHTML = "";
    if (!opts.quiet) $("list").innerHTML = `<div class="empty">…</div>`;
    let h, x = null;
    try { [h, x] = await Promise.all([api2("/home"), PRO() ? api2("/pro").catch(() => null) : null]); }
    catch (e) { $("list").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (NAV !== "home") return;
    if (PRO()) return proHome(h, x);
    // 5 kaam: bada "नया बिल", phir 4 tile — har tile par uska taaza ank
    const act = (icon, label, value, sub, nav) => `<button type="button" class="so-tile so-act" data-nav2="${nav}">
        <i aria-hidden="true">${icon}</i><span>${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ""}</button>`;
    const pc = h.plan || {};
    $("list").innerHTML = `
      ${homeAlerts(h, pc)}
      ${homeOffer(h, pc)}
      <div class="so-tiles">
        ${act("🧺", T("act_orders"), h.active, `${h.today.ready} ${T("n_ready")}${h.today.late ? ` · ${h.today.late} ${T("late")}` : ""}`, "orders")}
        ${act("👥", T("act_customers"), h.customers ?? "", T("n_customers"), "customers")}
        ${act("📒", T("act_dues"), money(h.udhaar.total), `${h.udhaar.customers} ${T("customers")}`, "dues")}
        ${act("💰", T("act_sales"), money(h.today.billed), `${h.today.bills} ${T("bills_n")} · ${T("collected")} ${money(h.today.collected || 0)}`, "today")}
      </div>
      ${planCard(pc)}
      <h3 class="so-h">${T("due_now")}</h3>
      ${h.due_orders.length ? h.due_orders.map(orderCard).join("") : `<p class="so-empty">${T("none_due")}</p>`}
      <h3 class="so-h">${T("ready_list")}</h3>
      ${h.ready_orders.length ? h.ready_orders.map(orderCard).join("") : `<p class="so-empty">${T("all_clear")}</p>`}`;
    $("list").querySelectorAll("[data-nav2]").forEach((b) => { b.onclick = () => go(b.dataset.nav2); });
    paintBars();
    wireCards($("list"), () => home({ quiet: true }));
    wireOffer();
    expiryPopup(pc);
    aiPopup(pc);
  }

  function homeAlerts(h, pc) {
    const ai = pc.ai_replies;
    const hot = ai && (ai.state === "limit" || ai.state === "paused");
    return `${lapseBanner(pc)}
      ${pc.pro_preview ? `<p class="so-alert so-warn" role="status">✦ ${T("pp_trial")}</p>` : ""}
      ${hot && !pc.lapse ? `<p class="so-alert" role="status">⚠️ ${T(ai.state === "limit" ? "ai_limit_hint" : "ai_paused_hint")}</p>` : ""}
      ${h.wa_down ? `<button type="button" class="so-alert so-warn so-sends" data-nav2="shop"><b>📵 ${T("wa_down")}</b><small>${T("wa_down_tap")} →</small></button>` : ""}
      ${h.app_sends ? `<button type="button" class="so-alert so-warn so-sends" data-nav2="sends"><b>📤 ${h.app_sends} ${T("sends_n")}</b><small>${T("sends_tap")} →</small></button>` : ""}`;
  }

  /* ---------- Solo Pro: आज ----------
   * Upar bikri + 7 din ka chart, phir bill, 4 kaam, lakshya, "आज के काम".
   * /pro fail ho to bhi screen chale (x = null: chart aur lakshya nahi). */
  const dayName = (iso) => new Date(iso + "T00:00:00").toLocaleDateString(L() ? "en-IN" : "hi-IN", { weekday: "short" });
  const deltaChip = (now, prev, label) => {
    if (!prev) return "";
    const pct = Math.round((now - prev) / prev * 100);
    return `<span class="pp-delta ${pct < 0 ? "down" : ""}">${pct < 0 ? "↓" : "↑"} ${Math.abs(pct)}% <small>${label}</small></span>`;
  };
  const bars = (rows, cls) => {
    const max = Math.max(1, ...rows.map((d) => d.billed));
    return `<div class="pp-chart ${cls}" aria-hidden="true">${rows.map((d) => `<div class="pp-bar${d.now ? " now" : ""}"><i data-h="${Math.max(4, Math.round(d.billed / max * 100))}"></i>${d.label ? `<span>${esc(d.label)}</span>` : ""}</div>`).join("")}</div>`;
  };
  function proHero(h, x) {
    const week = x ? x.week.map((d, i) => ({ ...d, label: dayName(d.date), now: i === x.week.length - 1 })) : [];
    return `<button type="button" class="pp-hero" data-nav2="today">
      <div class="pp-hero-top"><span class="pp-lbl">${T("billed")}</span>${x ? deltaChip(x.month.billed, x.month.prev_billed, T("pp_month_vs")) : ""}</div>
      <b class="pp-big">${money(h.today.billed)}</b>
      ${x ? `<span class="pp-yest">${T("pp_yest")} ${money(x.yesterday)}</span>${bars(week, "")}` : ""}
      <div class="pp-stats">
        <div><b>${money(h.today.collected || 0)}</b><span>${T("collected")}</span></div>
        <div><b>${h.today.bills}</b><span>${T("bills_today")}</span></div>
        <div><b>${money(h.udhaar.total)}</b><span>${T("udhaar")}</span></div>
      </div></button>`;
  }
  function proGoal(x) {
    if (!x) return "";
    const g = x.goal, sold = x.month.billed;
    if (!g.target) return `<button type="button" class="pp-card pp-goal" id="pp-goal"><span class="pp-ico">🎯</span>
      <span class="pp-grow"><b>${T("pp_goal_new")}</b><small>${T("pp_goal_hint")}</small></span><em>${T("pp_goal_set")}</em></button>`;
    const pct = Math.min(100, Math.round(sold / g.target * 100)), C = 2 * Math.PI * 26;
    return `<button type="button" class="pp-card pp-goal" id="pp-goal">
      <svg class="pp-ring" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26"/><circle class="on" cx="32" cy="32" r="26" stroke-dasharray="${(C * pct / 100).toFixed(1)} ${C.toFixed(1)}"/><text x="32" y="37" text-anchor="middle">${pct}%</text></svg>
      <span class="pp-grow"><small>${T("pp_goal")}</small><b>${money(sold)} / ${money(g.target)}</b>
      <small>${sold >= g.target ? T("pp_goal_done") : `${money(g.per_day)} ${T("pp_goal_day")} · ${g.days_left} ${T("pp_days_left")}`}</small></span></button>`;
  }
  function goalModal(target) {
    openModal(`<h3>${T("pp_goal")}</h3><label for="pp-goal-in">${T("pp_goal_q")}</label>
      <input id="pp-goal-in" type="number" inputmode="numeric" min="0" step="500" value="${target || ""}" placeholder="50000">
      <div class="btnrow">${target ? `<button class="btn ghost" id="pp-goal-rm">${T("pp_goal_remove")}</button>` : `<button class="btn ghost" data-act="close">${T("cancel")}</button>`}
      <button class="btn go" id="pp-goal-ok">${T("save")}</button></div>`);
    const save = (e, v) => busy(e.target, async () => {
      await api2("/pro/goal", { method: "PUT", body: { target: v } });
      closeModal(); toast(T("saved")); home({ quiet: true });
    });
    $("pp-goal-ok").onclick = (e) => { const v = Math.round(parseFloat($("pp-goal-in").value)); if (v > 0) save(e, v); else toast(T("pp_goal_q"), true); };
    if ($("pp-goal-rm")) $("pp-goal-rm").onclick = (e) => save(e, 0);
  }
  function proTasks(h, x) {
    const t = [];
    if (h.today.late) t.push(["hot", "i-task", `${h.today.late} ${T("pp_late")}`, T("pp_late_s"), "orders:active"]);
    if (h.today.ready) t.push(["ok", "i-basket", `${h.today.ready} ${T("pp_ready")}`, T("pp_ready_s"), "orders:ready"]);
    if (x && x.old_dues.customers) t.push(["warm", "i-ledger", `${x.old_dues.customers} ${T("pp_dues")} · ${money(x.old_dues.amount)}`, T("pp_dues_s"), "dues"]);
    if (x && x.comeback) t.push(["info", "i-users", `${x.comeback} ${T("pp_back")}`, T("pp_back_s"), "comeback"]);
    return `<h3 class="so-h">${T("pp_tasks")}</h3>` + (t.length ? `<div class="pp-tasks">${t.map(([c, ic, a, b, to]) => `<button type="button" class="pp-task" data-to="${to}">
      <span class="pp-ico ${c}">${icon(ic)}</span><span class="pp-grow"><b>${esc(a)}</b><small>${esc(b)}</small></span><i aria-hidden="true">›</i></button>`).join("")}</div>`
      : `<p class="so-empty">${T("pp_clear")}</p>`);
  }
  function proHome(h, x) {
    const pc = h.plan || {};
    const act = (ic, label, sub, nav) => `<button type="button" class="pp-act" data-nav2="${nav}"><span class="pp-ico">${icon(ic)}</span><b>${label}</b><small>${sub}</small></button>`;
    $("list").innerHTML = `
      ${homeAlerts(h, pc)}
      ${homeOffer(h, pc)}
      ${proHero(h, x)}
      <div class="pp-acts">
        ${act("i-basket", T("act_orders"), `${h.active} ${T("n_active")}`, "orders")}
        ${act("i-users", T("act_customers"), h.customers ?? "", "customers")}
        ${act("i-ledger", T("act_dues"), h.udhaar.customers, "dues")}
        ${act("i-reports", T("reports"), "", "reports")}
      </div>
      ${pc.lapse ? "" : `<div class="pp-card pp-dash"><b>💻 ${T("pp_dash_t")}</b><small>${T("pp_dash_s")}</small>
        <button type="button" class="btn go wide" id="pp-dash">${T("pp_dash_go")}</button></div>`}
      ${proGoal(x)}
      ${pc.lapse ? "" : proTasks(h, x)}
      ${h.due_orders.length ? `<h3 class="so-h">${T("due_now")}</h3>${h.due_orders.map(orderCard).join("")}` : ""}
      ${h.ready_orders.length ? `<h3 class="so-h">${T("ready_list")}</h3>${h.ready_orders.map(orderCard).join("")}` : ""}`;
    $("list").querySelectorAll("[data-nav2]").forEach((b) => { b.onclick = () => go(b.dataset.nav2); });
    $("list").querySelectorAll("[data-to]").forEach((b) => {
      b.onclick = () => { const [nav, f] = b.dataset.to.split(":"); if (f) ORDER_TAB = f; go(nav); };
    });
    if ($("pp-goal")) $("pp-goal").onclick = () => goalModal(x.goal.target);
    // Solo Pro: app se seedha dashboard — owner ka hi session (solo_owner.py /dashboard)
    if ($("pp-dash")) $("pp-dash").onclick = (e) => busy(e.target, async () => {
      const r = await api2("/dashboard", { method: "POST", body: {} });
      location.href = r.url || "/admin";
    });
    paintBars();
    wireCards($("list"), () => home({ quiet: true }));
    wireOffer();
    expiryPopup(pc);
    aiPopup(pc);
  }

  /* ---------- पुराने ग्राहक (Solo Pro) ----------
   * Tap = /open par asli <a>: server message bhar kar WhatsApp kholta hai,
   * number yahan aata hi nahi. Bhejna owner khud dabata hai. */
  async function comeback() {
    $("chips").innerHTML = "";
    $("list").innerHTML = `<div class="empty">…</div>`;
    let r;
    try { r = await api2("/pro/comeback"); } catch (e) { $("list").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (NAV !== "comeback") return;
    const empty = `<p class="so-empty">${T("pp_back_none")}</p>`;
    $("list").innerHTML = `<h3 class="so-h">${T("pp_back_title")}</h3><p class="so-sub">${T("pp_back_hint")}</p>
      ${r.customers.length ? r.customers.map((c) => `<article class="so-card pp-back">
        <div class="so-top"><b>${esc(c.name)}</b><span>${money(c.spent)}</span></div>
        <div class="so-sub">${c.last_days} ${T("pp_since_days")} · ${c.bills} ${T("bills_n")}</div>
        <div class="so-acts"><a class="btn go sm" href="/staff/api/owner/pro/comeback/${encodeURIComponent(c.customer_ref)}/open" target="_blank" rel="noopener">${T("pp_back_go")}</a></div></article>`).join("") : empty}`;
    $("list").querySelectorAll(".pp-back a").forEach((a) => {
      a.onclick = () => setTimeout(() => {
        a.closest(".pp-back").remove();
        if (!$("list").querySelector(".pp-back")) $("list").insertAdjacentHTML("beforeend", empty);
      }, 0);
    });
  }

  /* ---------- भेजने हैं ----------
   * WhatsApp nahi juda to grahak ke message yahan (services/app_sends.py).
   * "भेजो" asli <a> hai (staff.js waUrl) — tap khud gesture hai, popup
   * blocker nahi rokta; saath mein server ko "sent". */
  async function sends() {
    $("chips").innerHTML = "";
    $("list").innerHTML = `<div class="empty">…</div>`;
    let r;
    try { r = await api2("/app-sends"); } catch (e) { $("list").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (NAV !== "sends") return;
    const card = (m) => `<article class="so-card" data-id="${esc(m.id)}">
        <div class="so-top"><b>${esc(m.name || m.phone)}</b><small>${esc(m.phone)}</small></div>
        <p class="so-sub so-msg">${esc(m.text)}</p>
        <div class="so-acts">
          <a class="btn go sm" href="${esc(waUrl(m.phone, m.text))}" target="_blank" rel="noopener" data-send="sent">${T("sends_go")}</a>
          <button type="button" class="btn ghost sm" data-send="skipped">${T("sends_skip")}</button>
        </div></article>`;
    $("list").innerHTML = `<h3 class="so-h">${T("sends_title")}</h3>
      <p class="so-sub">${T("sends_hint")}</p>
      ${r.items.length ? r.items.map(card).join("") : `<p class="so-empty">${T("sends_none")}</p>`}
      <button type="button" class="btn ghost wide" data-nav2="shop">${T("sends_connect")}</button>`;
    $("list").querySelector("[data-nav2]").onclick = () => go("shop");
    $("list").querySelectorAll("[data-send]").forEach((b) => {
      b.onclick = () => {
        const c = b.closest(".so-card");
        api2(`/app-sends/${encodeURIComponent(c.dataset.id)}`, { method: "POST", body: { outcome: b.dataset.send } })
          .catch((e) => toast(e.message, true));
        // Card baad mein hatao — <a> ka khulna click ke poora hone par hota hai
        setTimeout(() => {
          const next = c.nextElementSibling;
          c.remove();
          if (!$("list").querySelector(".so-card[data-id]")) next.insertAdjacentHTML("beforebegin", `<p class="so-empty">${T("sends_none")}</p>`);
        }, 0);
      };
    });
  }

  /* Plan + AI jawab ka card — home aur plan screen dono par */
  const AI_STATE = { on: "ai_on", unlimited: "ai_on", warn: "ai_warn", limit: "ai_limit", paused: "ai_paused", off: "ai_off", lapsed: "ai_lapsed" };
  const shortDate = (iso) => iso ? new Date(iso + (iso.length <= 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
  /* AI ne is mahine kya kiya — owner ko kaam dikhe (jawab, pickup …), paisa nahi */
  function aiWork(w) {
    if (!w) return "";
    const parts = [[w.replies, "w_replies"], [w.pickups, "w_pickups"], [w.followups, "w_follow"], [w.photos, "w_photos"], [w.staff, "w_staff"]]
      .filter((x) => x[0] > 0).map(([n, k]) => `<b>${n}</b> ${T(k)}`);
    return parts.length ? `<small class="so-sub">${T("ai_work")}: ${parts.join(" · ")}</small>` : "";
  }
  /* "AI ne 40 jawab diye, Solo Pro mein 300 milte hain" — jab agle plan mein gine hue jawab hon */
  function upLine(p) {
    const ai = p.ai_replies, nx = p.next_plan;
    if (!ai || !ai.used || !nx || !nx.ai_replies) return "";
    return `<small class="so-sub">${T("up_line_a")} <b>${ai.used}</b> ${T("up_line_b")} ${esc(nx.name)} ${T("up_line_c")} <b>${nx.ai_replies}</b> ${T("up_line_d")}</small>`;
  }
  function aiBlock(ai) {
    if (!ai) return "";
    const pct = ai.included ? Math.min(100, Math.round(ai.used / ai.included * 100)) : 0;
    const cls = ai.state === "limit" || ai.state === "paused" || ai.state === "lapsed" ? "hot" : ai.state === "warn" ? "warm" : "";
    const hint = { limit: "ai_limit_hint", paused: "ai_paused_hint", off: "ai_off_hint", warn: "ai_warn_hint" }[ai.state];
    const refill = ai.trial ? `${T("ai_trial_a")} ${ai.after_trial} ${T("ai_trial_b")}`
      : L() ? `${T("ai_refill")} ${shortDate(ai.resets_on)}` : `${shortDate(ai.resets_on)} ${T("ai_refill")}`;
    return `<div class="so-use"><div class="so-use-l"><span>${T("ai_card")} <span class="so-state ${cls}">${T(AI_STATE[ai.state] || "ai_on")}</span></span>
        <b>${ai.used}${ai.included != null ? ` ${T("of")} ${ai.included}` : ""}${ai.credits ? ` + ${ai.credits} ${T("ai_recharge")}` : ""}</b></div>
      ${ai.included != null ? `<div class="so-bar"><i data-w="${pct}" class="${cls}"></i></div>
      <small class="so-sub">${ai.remaining} ${T("ai_left")} · ${refill}</small>` : ""}
      ${hint && ai.state !== "limit" && ai.state !== "paused" ? `<small class="so-sub">${T(hint)}</small>` : ""}</div>`;
  }
  /* Plan khatam / khatam hone wala — banner + "प्लान चालू करें" (plan screen par payment) */
  function lapseBanner(pc) {
    if (!pc || !pc.name) return "";
    if (pc.lapse) return `<div class="so-alert so-lapse" role="status"><p>⚠️ ${T(pc.lapse === "view_only" ? "lapse_view" : "lapse_new")}</p>
        <button type="button" class="btn go wide" data-nav2="plan">${T("renew")}</button></div>`;
    if (pc.days_left != null && pc.days_left <= 3) return `<div class="so-alert so-warn" role="status"><p>⏳ ${pc.days_left <= 0 ? T("ends_today") : `${pc.days_left} ${T("ends_in")}`}</p>
        <button type="button" class="btn ghost wide" data-nav2="plan">${T("renew")}</button></div>`;
    return "";
  }
  /* Offer: trial mein pehli payment ka hisaab + agla plan. × se 7 din chhupa,
     popup din mein ek baar. Browser storage sirf yaad ke liye — na mile to dikhta hai. */
  const store = {
    get(k) { try { return localStorage.getItem(`kk_solo_${ME.shop || ""}_${k}`); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(`kk_solo_${ME.shop || ""}_${k}`, v); } catch (e) { /* yaad nahi rahega, bas */ } },
  };
  const WEEK = 7 * 864e5;
  /* Offer ad ki tarah: us din dikhe, phir itne din chup. Yaad na rahe to dikhta hi hai. */
  function turnDue(key, days) {
    const today = new Date().toISOString().slice(0, 10), last = store.get(key);
    if (last === today) return true;
    if (last && Date.now() - Date.parse(last) < days * 864e5) return false;
    store.set(key, today);
    return true;
  }
  /* Control panel ka offer (services/promo_offers.py) pehle; na ho to plan wala,
     agar vendor ne wo band na kiya ho. Button seedha vendor ke WhatsApp par. */
  function homeOffer(h, pc) {
    const pr = h.promo || {};
    if (pr.offer) return promoCard(pr.offer);
    return pr.auto === false ? "" : offerCard(pc);
  }
  function promoCard(o) {
    const key = `promo_${o.id}`;
    if (Date.now() - Number(store.get(`${key}_x`) || 0) < o.every_days * 864e5) return "";
    if (!turnDue(`${key}_day`, o.every_days)) return "";
    return `<section class="card so-offer" id="so-offer" data-key="${esc(key)}_x">
      <span class="so-offer-tag">✦ ${T("offer_tag")}</span>
      <button type="button" class="so-x" id="so-offer-x" aria-label="${T("close")}">×</button>
      <h4 class="so-promo-t">${esc(o.title)}</h4><p class="so-promo-p">${esc(o.text)}</p>
      <a class="btn go wide" href="${esc(o.wa_url)}" target="_blank" rel="noopener">${esc(o.button)}</a></section>`;
  }
  const firstPay = (pc) => pc.price_inr + (pc.setup_inr || 0);
  const firstLine = (x) => x.setup_inr
    ? `<p class="so-offer-first">${T("offer_first")} <b>₹${firstPay(x)}</b> <small>₹${x.setup_inr} ${T("offer_setup")}</small></p><p class="hint">${T("offer_then")} ₹${x.price_inr}</p>`
    : `<p class="so-offer-first">₹${x.price_inr}/${T("offer_month")}</p>`;
  function offerCard(pc) {
    if (!pc || !pc.name || pc.lapse) return "";
    if (Date.now() - Number(store.get("offer_hidden") || 0) < WEEK) return "";
    const trial = pc.status === "trial";
    const up = pc.upsell;
    if ((!trial && !up) || !turnDue("offer_day", 3)) return "";
    const buy = trial ? `<div class="so-offer-box"><h4>${T("offer_after")}: ${esc(pc.name)}</h4>${firstLine(pc)}</div>` : "";
    const more = up ? `<div class="so-offer-box so-offer-up"><h4>${T("offer_more")} ${esc(up.name)} · ₹${up.price_inr}/${T("offer_month")}</h4>
        ${up.points.length ? `<ul class="so-ul">${up.points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</div>` : "";
    return `<section class="card so-offer" id="so-offer">
      <span class="so-offer-tag">✦ ${T("offer_tag")}</span>
      <button type="button" class="so-x" id="so-offer-x" aria-label="${T("close")}">×</button>
      ${buy}${more}
      <button type="button" class="btn go wide" data-nav2="plan">${T(trial ? "offer_take" : "offer_see")}</button></section>`;
  }
  function wireOffer() {
    const x = $("so-offer-x");
    if (x) x.onclick = () => { store.set($("so-offer").dataset.key || "offer_hidden", Date.now()); $("so-offer").remove(); };
  }
  function expiryPopup(pc) {
    if (!pc || !pc.name || pc.lapse || pc.days_left == null || pc.days_left > 3) return;
    if (ME.solo && !ME.onboarding_done) return;            // pehle 3 kadam wala popup
    if (typeof modalOpen === "function" && modalOpen()) return;
    const today = new Date().toISOString().slice(0, 10);
    if (store.get("popup_day") === today) return;
    store.set("popup_day", today);
    const left = pc.days_left <= 0 ? T("ends_today") : `${pc.days_left} ${T("ends_in")}`;
    openModal(`<button type="button" class="so-x" id="so-pop-x" aria-label="${T("close")}">×</button>
      <h3>⏳ ${T(pc.status === "trial" ? "pop_trial" : "pop_plan")}</h3><p class="said"><b>${left}</b></p><p class="said">${T("pop_hint")}</p>
      <div class="so-offer-box"><h4>${esc(pc.name)}</h4>${firstLine(pc)}</div>
      ${pc.upsell ? `<div class="so-offer-box so-offer-up"><h4>${esc(pc.upsell.name)}</h4>${firstLine(pc.upsell)}</div>` : ""}
      <div class="btnrow"><button type="button" class="btn ghost" id="so-pop-later">${T("later")}</button><button type="button" class="btn go" id="so-pop-go">${T("offer_take")}</button></div>`, "so-pop");
    $("so-pop-x").onclick = closeModal;
    $("so-pop-later").onclick = closeModal;
    $("so-pop-go").onclick = () => { closeModal(); go("plan"); };
  }
  /* AI jawab khatam / 80%: band hone wala card, din mein ek baar. Trial mein
     recharge nahi, plan; baaki par seedha recharge ke pack. */
  async function aiPopup(pc) {
    const ai = pc && pc.ai_replies;
    if (!ai || pc.lapse || !["limit", "warn"].includes(ai.state)) return;
    if (ME.solo && !ME.onboarding_done) return;
    const today = new Date().toISOString().slice(0, 10);
    if (store.get("ai_popup_day") === today) return;
    let p;
    try { p = await api2("/plan"); } catch (e) { return; }
    if (NAV !== "home" || (typeof modalOpen === "function" && modalOpen())) return;
    store.set("ai_popup_day", today);
    RC_LIVE = !!p.recharge_live;
    const packs = (p.packs || []).filter((x) => x.kind === "ai").slice(0, 3);
    // Agla Solo plan pehle: ₹50 ka recharge sasta dikhta hai, par kamai Solo Pro se hai
    const up = !ai.trial && pc.upsell && pc.upsell.ai_replies ? pc.upsell : null;
    const upCard = up ? `<div class="pp-card so-up"><h3>${esc(up.name)} · ₹${up.price_inr}</h3><p class="said">${T("up_title")} ${up.ai_replies} ${T("up_replies")}</p>
      <button type="button" class="btn go wide" id="so-rc-up">${T("up_cta")}</button></div><p class="said">${T("up_or")}</p>` : "";
    const body = ai.trial ? `<div class="btnrow"><button type="button" class="btn ghost" id="so-rc-later">${T("later")}</button><button type="button" class="btn go" id="so-rc-go">${T("offer_take")}</button></div>`
      : `<div class="so-packs">${packs.map((x) => packLink(x, p.sales_wa)).join("")}</div><div class="btnrow"><button type="button" class="btn ghost wide" id="so-rc-later">${T("later")}</button></div>`;
    openModal(`<button type="button" class="so-x" id="so-rc-x" aria-label="${T("close")}">×</button>
      <h3>${T(ai.state === "limit" ? (ai.trial ? "rc_trial" : "rc_limit") : "rc_warn")}</h3>
      <p class="said"><b>${ai.used} ${T("of")} ${ai.included}</b></p>
      <p class="said">${T(ai.trial ? "rc_trial_hint" : "rc_hint")}</p>${upCard}${body}`, "so-pop");
    $("so-rc-x").onclick = closeModal;
    wireRecharge();
    $("so-rc-later").onclick = closeModal;
    if ($("so-rc-go")) $("so-rc-go").onclick = () => { closeModal(); go("plan"); };
    if ($("so-rc-up")) $("so-rc-up").onclick = () => { BUY.code = up.code; closeModal(); go("plan"); };
  }
  const ring = (v) => (window.KKPlanRing ? KKPlanRing.html(v, L() ? "en" : "hi") : "");
  function planCard(pc) {
    if (!pc || !pc.name) return "";
    return `<button type="button" class="card so-plan" data-nav2="plan">${ring(pc.validity)}
      ${aiBlock(pc.ai_replies)}${aiWork(pc.ai_work)}</button>`;
  }

  /* ---------- ऑर्डर ---------- */
  let ORDERS = [], TOTAL = 0, SEQ = 0, ORDER_TAB = "";     // ORDER_TAB: go() FILTER saaf karta hai
  async function orders(opts = {}) {
    if (ORDER_TAB) { FILTER = ORDER_TAB; ORDER_TAB = ""; }
    if (!["active", "received", "washing", "ready", "done", "cancelled"].includes(FILTER)) FILTER = "active";
    const chips = [["active", T("chip_active")], ["received", T("chip_received")], ["washing", T("chip_washing")], ["ready", T("chip_ready")], ["done", T("chip_done")], ["cancelled", T("chip_cancelled")]];
    $("chips").innerHTML = chips.map(([v, l]) => `<button data-chip="${v}" class="${FILTER === v ? "on" : ""}">${l}</button>`).join("");
    if (!opts.quiet && !opts.more) $("list").innerHTML = `<div class="empty">…</div>`;
    const mine = ++SEQ;
    const q = $("q").value.trim();
    const p = new URLSearchParams({ tab: q ? "all" : FILTER, limit: String(PAGE), offset: String(opts.more ? ORDERS.length : 0) });
    if (q) p.set("q", q);
    let r;
    try { r = await api2("/orders?" + p); } catch (e) { if (mine === SEQ) $("list").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (mine !== SEQ || NAV !== "orders") return;
    ORDERS = opts.more ? ORDERS.concat(r.orders) : r.orders; TOTAL = r.total;
    $("list").innerHTML = (ORDERS.length ? ORDERS.map(orderCard).join("") : `<div class="empty"><b>${T("no_orders")}</b></div>`)
      + (ORDERS.length < TOTAL ? `<button type="button" class="btn ghost wide" id="so-more">${T("more")} (${ORDERS.length}/${TOTAL})</button>` : "");
    wireCards($("list"), () => orders({ quiet: true }));
    if ($("so-more")) $("so-more").onclick = () => orders({ more: true });
  }

  /* ---------- उधार ---------- */
  async function dues(opts = {}) {
    $("chips").innerHTML = "";
    if (!opts.quiet) $("list").innerHTML = `<div class="empty">…</div>`;
    let d;
    try { d = await api2("/dues"); } catch (e) { $("list").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (NAV !== "dues") return;
    $("list").innerHTML = `<div class="so-total"><span>${T("dues_total")}</span><b>${money(d.total)}</b></div>`
      + (d.customers.length ? d.customers.map((c) => `<article class="so-card">
          <div class="so-top"><b>${esc(c.name)}</b><span class="so-due">${money(c.due)}</span></div>
          <div class="so-sub">${esc(c.phone)} · ${c.bills} ${T("bills_n")} · ${c.oldest_days} ${T("ago")}${c.opted_out ? ` · <span class="tag late">${T("opted_out")}</span>` : ""}</div>
          <div class="so-acts">
            ${c.opted_out ? "" : `<button class="btn ghost sm" data-du="remind" data-num="${esc(c.latest_number)}">${T("remind")}</button>`}
            <button class="btn go sm" data-du="pay" data-num="${esc(c.latest_number)}" data-due="${c.latest_due}">${T("got_money")}</button>
          </div></article>`).join("") : `<p class="so-empty">${T("dues_none")}</p>`);
    $("list").querySelectorAll("[data-du]").forEach((b) => {
      b.onclick = () => b.dataset.du === "remind" ? remindBill(b.dataset.num, b) : askCollect(b.dataset.num, parseFloat(b.dataset.due));
    });
  }

  /* ---------- आप ---------- */
  function me() {
    $("chips").innerHTML = "";
    $("list").innerHTML = `<div class="you you-${esc(ME.plan_tier || "solo")}">
      ${youHero(`${T("owner")} · ${ME.shop || ""}`, ME.plan)}
      <div class="you-body">
        ${ME.plan_validity ? `<div class="you-card">${ring(ME.plan_validity)}</div>` : ""}
        ${youGroup(T("shop"), [
          youRow("i-ledger", T("rate_card"), 'data-nav2="rates"'),
          youRow("i-reports", T("reports"), 'data-nav2="reports"'),
          PRO() ? youRow("i-campaign", T("pp_back_title"), 'data-nav2="comeback"') : "",
          youRow("i-users", T("act_customers"), 'data-nav2="customers"'),
          youRow("i-briefcase", T("shop"), 'data-nav2="shop"'),
          youRow("i-receipt", T("plan"), 'data-nav2="plan"'),
        ])}
        ${youGroup(T("yt_app"), [
          ME.viewing_as ? "" : `<div class="you-row" id="p-push"></div>`,
          youRow("i-image", T("yt_lang"), 'id="so-lang"', T("lang")),
          window.canInstall && canInstall() ? youRow("i-upload", T("install"), 'id="so-install"') : "",
        ])}
        ${youGroup(T("yt_account"), [
          youRow("i-settings", T("pw"), 'id="p-pw"'),
          youRow("i-logout", T("logout"), 'id="p-out"', "", "danger"),
        ])}
      </div></div>`;
    if (window.paintPushCard) paintPushCard();
    $("list").querySelectorAll("[data-nav2]").forEach((b) => { b.onclick = () => go(b.dataset.nav2); });
    $("so-lang").onclick = (e) => busy(e.target, async () => {
      const ui_lang = L() ? "hi" : "en";
      await api2("/shop", { method: "PUT", body: { ui_lang } });
      ME.ui_lang = ui_lang; renderNav(); me();
    });
    $("p-pw").onclick = changePw;
    if ($("so-install")) $("so-install").onclick = installApp;
    // Dono login khatam: app ka (kk_staff) aur dashboard ka (kk_session). Sirf pehla
    // jaata to reload par /api/solo/app-session dashboard login se wapas andar le aata.
    $("p-out").onclick = async () => {
      try { await api("/logout", { method: "POST" }); } catch (e) { /* cookie jayegi */ }
      try { await fetch("/api/logout", { method: "POST", credentials: "same-origin" }); } catch (e) { /* offline */ }
      location.replace("/solo");
    };
  }

  /* ---------- रेट कार्ड ---------- */
  let RC = [];
  async function rates() {
    $("chips").innerHTML = "";
    $("list").innerHTML = `<div class="empty">…</div>`;
    try { RC = await api2("/rates"); } catch (e) { $("list").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (NAV !== "rates") return;
    const services = [...new Set(RC.map((r) => r.service))];
    const row = (r) => `<div class="so-rate ${r.is_active ? "" : "off"}" data-id="${r.id}">
        <span class="so-rn">${esc(r.garment || T("per_kg"))}${r.unit === "kg" ? ` <small>/${T("kg")}</small>` : ""}</span>
        <label class="so-ri">₹<input type="number" inputmode="decimal" min="0" step="0.5" value="${r.rate}" aria-label="${esc(r.garment || r.service)} ${T("rate")}" data-rate="${r.id}"></label>
        <button type="button" class="so-tog ${r.is_active ? "on" : ""}" data-tog="${r.id}" aria-pressed="${r.is_active}">${r.is_active ? T("on") : T("off")}</button></div>`;
    $("list").innerHTML = `<p class="hint so-hint">${T("rate_hint")}</p>`
      + services.map((s) => `<div class="card so-svc"><h3>${esc(s)}</h3>${RC.filter((r) => r.service === s).map(row).join("")}</div>`).join("")
      + `<button type="button" class="btn go wide" id="so-add">${T("add_item")}</button>`;
    $("list").querySelectorAll("[data-rate]").forEach((i) => {
      i.onchange = async () => {
        const v = parseFloat(i.value);
        if (!(v > 0)) { toast("Rate > 0", true); return; }
        try { await api2(`/rates/${i.dataset.rate}`, { method: "PUT", body: { rate: v } }); toast(T("saved")); }
        catch (e) { toast(e.message, true); }
      };
    });
    $("list").querySelectorAll("[data-tog]").forEach((b) => {
      b.onclick = () => busy(b, async () => {
        const r = RC.find((x) => x.id === b.dataset.tog);
        const res = await api2(`/rates/${r.id}`, { method: "PUT", body: { is_active: !r.is_active } });
        r.is_active = res.is_active; rates();
      });
    });
    $("so-add").onclick = () => addRate(services);
  }
  /* Laundry ki aam services — naam English mein hi save (bill par yahi chhapta hai).
     Dukaan ki apni purani service bhi list mein, aur "और" se nayi likh sakte hain. */
  const SERVICES = [["Dry Clean", "ड्राई क्लीन"], ["Wash & Iron", "धुलाई और प्रेस"], ["Wash & Fold", "धुलाई और तह"],
    ["Wash Only", "सिर्फ़ धुलाई"], ["Iron", "प्रेस"], ["Steam Iron", "स्टीम प्रेस"], ["Starch", "कलफ़ / माड़"],
    ["Saree Polish", "साड़ी पॉलिश"], ["Stain Removal", "दाग़ हटाना"], ["Shoe Clean", "जूते की सफ़ाई"]];
  function addRate(services) {
    const hi = Object.fromEntries(SERVICES);
    const opts = [...new Set([...services, ...SERVICES.map(([s]) => s)])];
    const label = (s) => (hi[s] && !L() ? `${s} · ${hi[s]}` : s);
    openModal(`<h3>${T("add_item")}</h3>
      <label for="so-svc">${T("service")}</label>
      <select id="so-svc">${opts.map((s) => `<option value="${esc(s)}">${esc(label(s))}</option>`).join("")}<option value="">${T("svc_other")}</option></select>
      <input id="so-svc-new" maxlength="60" autocomplete="off" placeholder="${T("svc_other")}" aria-label="${T("service")}" hidden>
      <label for="so-unit">${T("unit")}</label>
      <select id="so-unit"><option value="pc">${T("piece")}</option><option value="kg">${T("kg")}</option></select>
      <label for="so-item">${T("item")}</label><input id="so-item" maxlength="60" placeholder="Shirt">
      <label for="so-rate">${T("rate")}</label><input id="so-rate" type="number" inputmode="decimal" min="0" step="0.5">
      <div class="err" id="so-err"></div>
      <div class="btnrow"><button class="btn ghost" data-act="close">${T("cancel")}</button><button class="btn go" id="so-ok">${T("save")}</button></div>`);
    $("so-svc").onchange = () => { $("so-svc-new").hidden = !!$("so-svc").value; };
    $("so-unit").onchange = () => { $("so-item").disabled = $("so-unit").value === "kg"; };
    $("so-ok").onclick = (e) => busy(e.target, async () => {
      const body = { service: ($("so-svc").value || $("so-svc-new").value).trim(), unit: $("so-unit").value, garment: $("so-item").value.trim(), rate: parseFloat($("so-rate").value) };
      if (!body.service || !(body.rate > 0) || (body.unit === "pc" && !body.garment)) { $("so-err").textContent = T("rate_hint"); return; }
      try { await api("/rates", { method: "POST", body }); } catch (err) { $("so-err").textContent = err.message; return; }
      closeModal(); toast(T("saved")); rates();
    });
  }

  /* ---------- दुकान ---------- */
  async function shop() {
    $("chips").innerHTML = "";
    $("list").innerHTML = `<div class="empty">…</div>`;
    let s;
    try { s = await api2("/shop"); } catch (e) { $("list").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (NAV !== "shop") return;
    const f = (k, label, ph = "", type = "text") => `<label for="so-${k}">${label}</label><input id="so-${k}" type="${type}" value="${esc(s[k] || "")}" placeholder="${esc(ph)}" maxlength="300">`;
    const wa = s.whatsapp;
    $("list").innerHTML = `
      <div class="card" id="so-wa-card"><h3>${T("wa")}</h3><p class="hint">…</p></div>
      <div class="card">
        ${f("shop_name", T("shop_name"))}${f("owner_name", T("owner_name"))}${f("shop_address", T("address"), "Sigra, Varanasi")}
        ${f("shop_contact_phone", T("phone"), "98xxxxxxxx", "tel")}${f("upi_vpa", T("upi"), "naam@upi")}${f("upi_payee", T("upi_name"))}
        ${f("invoice_footer", T("footer"), "Thank you!")}
        <div class="btnrow"><button class="btn go wide" id="so-save">${T("save")}</button></div></div>`;
    waCard(wa, s.owner_phone || "");
    $("so-save").onclick = (e) => busy(e.target, async () => {
      const body = {};
      for (const k of ["shop_name", "owner_name", "shop_address", "shop_contact_phone", "upi_vpa", "upi_payee", "invoice_footer"]) body[k] = $("so-" + k).value.trim();
      if (body.shop_name.length < 2) { toast(T("shop_name"), true); return; }
      if (!body.owner_name) delete body.owner_name;
      const r = await api2("/shop", { method: "PUT", body });
      ME.shop = r.shop_name; $("whoRole").textContent = `${T("owner")} · ${r.shop_name}`;
      if (r.owner_name) { ME.name = r.owner_name; $("who").textContent = r.owner_name; }
      toast(T("saved"));
    });
  }

  /* WhatsApp: har dukaan ka APNA number (routers/solo_owner.py /whatsapp*) */
  let WA_POLL = 0;
  /* QR / code ke baad WhatsApp ne passkey maanga (kk-passkey.js): QR wala
     poll band, passkey wala card. Jud gaya ya QR expire -> card dobara. */
  function waPasskey(el, legacy, ownerPhone) {
    WA_POLL++;
    if (!el || !window.KKPasskey) return;
    KKPasskey.mount(el, {
      api: api2, base: "/whatsapp/passkey", lang: L() ? "en" : "hi",
      onDone: () => { toast(T("wa_connected_as")); waCard(legacy, ownerPhone); },
      onRestart: () => waCard(legacy, ownerPhone),
    });
  }
  async function waCard(legacy, ownerPhone) {
    const box = $("so-wa-card"); if (!box) return;
    let st;
    try { st = await api2("/whatsapp"); } catch (e) { st = { mode: "none", can_connect: false }; }
    if (!$("so-wa-card")) return;
    const head = `<h3>${T("wa")}</h3>`;
    if (st.mode === "home") { box.innerHTML = head + `<p class="so-ok">${T("wa_on")}</p><p class="hint">${T("wa_home")}</p>`; return; }
    if (st.mode === "lite") {   // Solo Lite: apna number nahi judta (solo_owner.py wa_connect)
      box.innerHTML = head + `<p class="hint">${T("wa_lite")}</p><button type="button" class="btn ghost wide" id="so-wa-up">${T("wa_lite_up")}</button>`;
      $("so-wa-up").onclick = () => go("plan");
      return;
    }
    if (st.connected) {
      box.innerHTML = head + `<p class="so-ok">${T("wa_connected_as")} ${esc(st.number_masked || "")}</p><p class="hint">${T("wa_own_note")}</p>
        <button class="btn ghost wide" id="so-wa-off">${T("wa_remove")}</button>`;
      $("so-wa-off").onclick = (e) => { if (window.confirm(T("wa_remove_q"))) busy(e.target, async () => { await api2("/whatsapp/disconnect", { method: "POST", body: {} }); waCard(legacy, ownerPhone); }); };
      return;
    }
    if (!st.can_connect) {     // server par WAHA nahi — purana rasta: hum jod denge
      box.innerHTML = head + `<p class="hint">${legacy && legacy.requested ? T("wa_req") : T("wa_off")}</p>
        ${legacy && legacy.requested ? "" : `<button class="btn go wide" id="so-wa">${T("wa_btn")}</button>`}`;
      if ($("so-wa")) $("so-wa").onclick = (e) => busy(e.target, async () => { await api2("/whatsapp-request", { method: "POST", body: {} }); toast(T("wa_req")); waCard({ requested: true }, ownerPhone); });
      return;
    }
    if (window.KKPasskey && KKPasskey.isPasskey(st.state)) {
      box.innerHTML = head + `<div id="so-wa-step"></div>`;
      return waPasskey($("so-wa-step"), legacy, ownerPhone);
    }
    box.innerHTML = head + `<p class="hint">${T(st.session && st.state ? "wa_lost" : "wa_not_now")}</p><p class="hint">${T("wa_own_note")}</p>
      <label for="so-wa-ph">${T("wa_number")}</label><input id="so-wa-ph" type="tel" inputmode="tel" value="${esc(ownerPhone)}" maxlength="20">
      <button class="btn go wide" id="so-wa-go">${T("wa_get_code")}</button><div id="so-wa-step"></div>`;
    $("so-wa-go").onclick = (e) => busy(e.target, async () => {
      const r = await api2("/whatsapp/connect", { method: "POST", body: { phone: $("so-wa-ph").value.trim() } });
      if (r.passkey) return waPasskey($("so-wa-step"), legacy, ownerPhone);
      $("so-wa-step").innerHTML = `${r.code ? `<p class="hint">${T("wa_code_steps")}</p><p class="so-code">${esc(r.code)}</p>` : `<p class="so-alert" role="status">${T("wa_no_code")}</p>`}
        <p class="hint" id="so-wa-wait">${T("wa_waiting")}</p>
        <button type="button" class="btn ghost wide" id="so-wa-qr">${T("wa_show_qr")}</button><div id="so-wa-qrimg"></div>`;
      // WhatsApp ka QR ~20s mein badalta hai: khula ho to ~16s par naya, toota to agli tick phir
      const qr = () => {
        const img = $("so-wa-qrimg").querySelector("img") || Object.assign(document.createElement("img"), { className: "so-qr", alt: "WhatsApp QR" });
        img.onerror = () => { img.hidden = true; $("so-wa-wait").textContent = T("wa_qr_wait"); };
        img.onload = () => { img.hidden = false; $("so-wa-wait").textContent = T("wa_waiting"); };
        img.src = `/staff/api/owner/whatsapp/qr?t=${Date.now()}`;
        if (!img.isConnected) $("so-wa-qrimg").appendChild(img);
      };
      $("so-wa-qr").onclick = qr;
      const mine = ++WA_POLL, until = Date.now() + 3 * 60 * 1000;
      let n = 0;
      const tick = async () => {
        if (mine !== WA_POLL || !$("so-wa-card") || Date.now() > until) return;
        const shown = $("so-wa-qrimg").querySelector("img");
        if (shown && (shown.hidden || ++n % 4 === 0)) qr();
        try {
          const s2 = await api2("/whatsapp");
          if (s2.connected) { toast(T("wa_connected_as")); return waCard(legacy, ownerPhone); }
          if (window.KKPasskey && KKPasskey.isPasskey(s2.state)) return waPasskey($("so-wa-step"), legacy, ownerPhone);
        } catch (err) { /* agli baar */ }
        setTimeout(tick, 4000);
      };
      setTimeout(tick, 4000);
    });
  }

  /* ---------- प्लान ---------- */
  async function plan() {
    $("chips").innerHTML = "";
    $("list").innerHTML = `<div class="empty">…</div>`;
    let p;
    try { p = await api2("/plan"); } catch (e) { $("list").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (NAV !== "plan") return;
    RC_LIVE = !!p.recharge_live;
    const bar = (label, u) => { const pct = u.limit ? Math.min(100, Math.round(u.used / u.limit * 100)) : 0;
      return `<div class="so-use"><div class="so-use-l"><span>${label}</span><b>${u.used}${u.limit ? ` ${T("of")} ${u.limit}` : ""}</b></div><div class="so-bar"><i data-w="${pct}" class="${pct >= 90 ? "hot" : ""}"></i></div></div>`; };
    const d = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
    $("list").innerHTML = `
      ${lapseBanner({ name: p.name, lapse: p.lapse, days_left: p.days_left }).replace(/<button[\s\S]*?<\/button>/, "")}
      ${buyCard(p)}
      <div class="card">${ring(p.validity)}<h3>${esc(p.name)} · ₹${p.price_inr}/${L() ? "month" : "महीना"}</h3>
        <p class="hint">${p.status === "trial" ? `${T("plan_trial")} ${d(p.trial_ends_at)} ${T("plan_till")}` : p.period_end ? `${d(p.period_end)} ${T("plan_till")}` : esc(p.status)}</p>
        ${aiBlock(p.ai_replies)}${aiWork(p.ai_work)}${upLine(p)}
        ${bar(T("orders_m"), p.usage.orders)}${bar(T("wa_m"), p.usage.whatsapp)}</div>
      ${PRO() ? `<div class="pp-card pp-perks"><b>✦ ${T("pp_perks")}</b><ul>${["pp_perk5", "pp_perk1", "pp_perk2", "pp_perk3", "pp_perk4"].map((k) => `<li>${T(k)}</li>`).join("")}</ul></div>` : ""}
      ${p.next_plan ? `<div class="card"><h3>${T("upgrade")}: ${esc(p.next_plan.name)} · ₹${p.next_plan.price_inr}</h3><ul class="so-ul">${p.next_plan.points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      <div class="card so-rc"><h3>${T("packs")}</h3>${packGrid(p.packs, p.sales_wa)}<p class="hint">${T(RC_LIVE ? "rc_note_live" : "rc_note")}</p></div>`;
    paintBars();
    wireBuy(p);
    wireRecharge();
  }

  /* Khud plan lena: Starter / Pro × mahina / saal — poora hisaab dikha kar.
     Payment Razorpay ke page par; plan webhook se chalu hota hai, browser se nahi. */
  // Saal pehle (15 Nov 2026): "₹3000 saal, ₹8 roz" mahine ke ₹300 se sasta lagta hai
  let BUY = { code: "", annual: true };
  /* Recharge: pack par tap = hamara WhatsApp, pack aur daam likha hua */
  let RC_LIVE = false;
  /* Phone par tile: bada number, kis cheez ka, daam — dabane layak dikhe. Title
     server ka (English) sirf screen reader aur WhatsApp sandesh mein. */
  const packTile = (x) => `<b class="so-pack-n">${Number(x.units || 0).toLocaleString("en-IN")}</b>
    <span class="so-pack-k">${T(x.kind === "ai" ? "pk_ai" : "pk_wa")}</span><span class="so-pack-p">₹${x.price_inr} ›</span>`;
  const packLink = (x, wa) => RC_LIVE
    ? `<button type="button" class="so-pack" data-rc="${esc(x.id)}" aria-label="${esc(x.title)} · ₹${x.price_inr}">${packTile(x)}</button>`
    : `<a class="so-pack" href="${esc(waUrl(wa, `नमस्ते, मुझे ${x.title} रिचार्ज चाहिए (₹${x.price_inr}). दुकान: ${ME.shop || ""}`))}" target="_blank" rel="noopener" aria-label="${esc(x.title)} · ₹${x.price_inr}">${packTile(x)}</a>`;
  /* AI jawab aur WhatsApp message alag: ek lambi mili-juli list nahi */
  const packGrid = (packs, wa) => ["ai", "wa"].map((k) => {
    const xs = (packs || []).filter((x) => (k === "ai") === (x.kind === "ai"));
    return xs.length ? `<h4 class="so-pack-h">${T(k === "ai" ? "pk_ai" : "pk_wa")}</h4><div class="so-packs">${xs.map((x) => packLink(x, wa)).join("")}</div>` : "";
  }).join("");
  /* Online payment band: plan seedha aapke WhatsApp par — rakam aur dukaan likhi hui */
  const buyMessage = (b, br) => `नमस्ते, मुझे ${b.name} प्लान लेना है (${T(BUY.annual ? "yearly" : "monthly")}). कुल ${money(br.total_inr)}. दुकान: ${ME.shop || ""}`;
  /* Razorpay se recharge: paisa aate hi balance apne aap (recharge_pay.py) */
  function wireRecharge() {
    document.querySelectorAll("[data-rc]").forEach((b) => {
      b.onclick = (e) => busy(e.currentTarget, async () => {
        const r = await api2("/recharge", { method: "POST", body: { pack: b.dataset.rc } });
        if (r.url) window.open(r.url, "_blank", "noopener");
      });
    });
  }
  function buyCard(p) {
    if (!p.buy || !p.buy.length) return "";
    if (!p.buy.some((b) => b.code === BUY.code)) BUY.code = p.buy.some((b) => b.code === p.code) ? p.code : p.buy[0].code;
    const b = p.buy.find((x) => x.code === BUY.code), br = BUY.annual ? b.annual : b.monthly;
    const row = (a, v) => `<div class="kv"><span>${a}</span><b>${v}</b></div>`;
    return `<div class="card so-buy"><h3>${T("buy_title")}</h3>
      ${p.buy.length < 2 ? "" : `<div class="so-chips" role="group" aria-label="${T("b_plan")}">${p.buy.map((x) => `<button type="button" data-buy="${esc(x.code)}" class="${x.code === BUY.code ? "on" : ""}" aria-pressed="${x.code === BUY.code}"><b>${esc(x.name)}</b><small>₹${(BUY.annual ? x.annual : x.monthly).plan_inr}/${T(BUY.annual ? "per_year" : "per_month")}</small></button>`).join("")}</div>`}
      <div class="so-chips" role="group" aria-label="${T("monthly")}">
        <button type="button" data-cyc="y" class="${BUY.annual ? "on" : ""}" aria-pressed="${BUY.annual}">${T("yearly").split(" · ").map((s, i) => i ? `<small>${s}</small>` : `<b>${s}</b>`).join("")}</button>
        <button type="button" data-cyc="m" class="${BUY.annual ? "" : "on"}" aria-pressed="${!BUY.annual}"><b>${T("monthly")}</b></button></div>
      ${row(`${T("b_plan")} · ${esc(b.name)}`, money(br.plan_inr))}
      ${BUY.annual ? `<small class="so-sub">≈ ${money(Math.round(br.plan_inr / 365))} ${T("per_day")}</small>` : ""}
      ${br.setup_inr ? row(T("b_setup"), money(br.setup_inr)) : ""}
      ${br.gst_percent ? row(`${T("b_gst")} ${br.gst_percent}%`, money(br.gst_inr)) : ""}
      <div class="kv so-total-row"><span>${T("b_total")}</span><b>${money(br.total_inr)}</b></div>
      ${p.payments_live ? `<button type="button" class="btn go wide" id="so-pay">${money(br.total_inr)} ${T("pay_now")}</button>`
        : `<a class="btn go wide" id="so-pay-wa" href="${esc(waUrl(p.sales_wa, buyMessage(b, br)))}" target="_blank" rel="noopener">${T("buy_wa")} · ${money(br.total_inr)}</a>`}
      <p class="hint" id="so-pay-hint">${T(p.payments_live ? "pay_note" : "pay_off")}</p></div>`;
  }
  function wireBuy(p) {
    $("list").querySelectorAll("[data-buy]").forEach((x) => { x.onclick = () => { BUY.code = x.dataset.buy; plan(); }; });
    $("list").querySelectorAll("[data-cyc]").forEach((x) => { x.onclick = () => { BUY.annual = x.dataset.cyc === "y"; plan(); }; });
    if ($("so-pay")) $("so-pay").onclick = (e) => busy(e.target, async () => {
      const r = await api2("/checkout", { method: "POST", body: { plan: BUY.code, annual: BUY.annual } });
      if (r.available && r.url) { window.open(r.url, "_blank", "noopener"); $("so-pay-hint").textContent = T("pay_opened"); }
      else { $("so-pay-hint").textContent = T("pay_off"); toast(T("pay_off"), true); }
    });
  }

  /* ---------- ग्राहक ---------- */
  let CUSTS = [], CTOTAL = 0, CSEQ = 0;
  async function customers(opts = {}) {
    $("chips").innerHTML = "";
    if (!opts.quiet && !opts.more) $("list").innerHTML = `<div class="empty">…</div>`;
    const mine = ++CSEQ;
    const p = new URLSearchParams({ limit: String(PAGE), offset: String(opts.more ? CUSTS.length : 0) });
    const q = $("q").value.trim();
    if (q) p.set("q", q);
    let r;
    try { r = await api2("/customers?" + p); } catch (e) { if (mine === CSEQ) $("list").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (mine !== CSEQ || NAV !== "customers") return;
    CUSTS = opts.more ? CUSTS.concat(r.customers) : r.customers; CTOTAL = r.total;
    const last = (d) => d == null ? "" : d === 0 ? T("last_today") : `${d} ${T("days_ago")}`;
    $("list").innerHTML = (CUSTS.length ? CUSTS.map((c) => `<button type="button" class="so-card so-cust" data-ref="${esc(c.customer_ref)}">
        <div class="so-top"><b>${esc(c.name)}</b><span class="so-due ${c.due > 0 ? "" : "ok"}">${c.due > 0 ? money(c.due) + " " + T("due") : c.bills ? "✓ " + T("paid") : T("cadd_new")}</span></div>
        <div class="so-sub">${[esc(c.phone), ...(c.bills ? [`${c.bills} ${T("bills_n")}`, `${T("spent")} ${money(c.spent)}`, esc(last(c.last_days))] : [])].join(" · ")}</div></button>`).join("")
      : `<div class="empty"><b>${T("no_customers")}</b><p>${q ? "" : T("cadd_first")}</p></div>`)
      + (CUSTS.length < CTOTAL ? `<button type="button" class="btn ghost wide" id="so-cmore">${T("more")} (${CUSTS.length}/${CTOTAL})</button>` : "")
      + `<button type="button" class="so-cfab" id="so-cadd" aria-label="${T("cadd")}">+</button>`;
    $("so-cadd").onclick = addCustomers;
    $("list").querySelectorAll(".so-cust").forEach((b) => { b.onclick = () => customerSheet(b.dataset.ref); });
    if ($("so-cmore")) $("so-cmore").onclick = () => customers({ more: true });
  }
  /* ---------- ग्राहक जोड़ें: phone ke contacts ya haath se, ek saath ----------
     Contact Picker sirf Android Chrome mein hai; iPhone par rows haath se bharte hain.
     Contacts phone se bahar tabhi jaate hain jab owner khud chune aur jodein. */
  const canPickContacts = () => !!(navigator.contacts && navigator.contacts.select);
  const MAX_ADD = 200;
  const custRow = (c = {}) => `<div class="so-addrow">
      <div class="so-addtwo">
        <input class="ca-name" placeholder="${T("cadd_name")}" aria-label="${T("cadd_name")}" maxlength="120" autocomplete="off" value="${esc(c.name || "")}">
        <input class="ca-phone" type="tel" inputmode="tel" placeholder="${T("cadd_phone")}" aria-label="${T("cadd_phone")}" maxlength="30" autocomplete="off" value="${esc(c.phone || "")}">
      </div>
      <input class="ca-address" placeholder="${T("cadd_address")}" aria-label="${T("cadd_address")}" maxlength="400" autocomplete="off" value="${esc(c.address || "")}">
      <button type="button" class="so-addx" aria-label="${T("cadd_remove")}">×</button>
    </div>`;
  function readCustRows() {
    return [...$("ca-rows").querySelectorAll(".so-addrow")].map((r) => ({
      name: r.querySelector(".ca-name").value.trim(),
      phone: r.querySelector(".ca-phone").value.trim(),
      address: r.querySelector(".ca-address").value.trim(),
    })).filter((c) => c.name || c.phone || c.address);
  }
  function paintCustRows(rows) {
    $("ca-rows").innerHTML = (rows.length ? rows : [{}]).map(custRow).join("");
    const n = readCustRows().length;
    $("ca-save").textContent = n > 1 ? `${n} ${T("cadd_save")}` : T("cadd_save");
  }
  async function pickContacts() {
    $("ca-err").textContent = "";
    let props = ["name", "tel"];
    try { if ((await navigator.contacts.getProperties()).includes("address")) props.push("address"); } catch (e) { /* naam + number kaafi */ }
    let picked;
    try { picked = await navigator.contacts.select(props, { multiple: true }); } catch (e) { return; }  // owner ne band kiya
    const add = (picked || []).map((c) => {
      const a = (c.address || [])[0];
      const address = a ? [...(a.addressLine || []), a.city].filter(Boolean).join(", ") : "";
      return { name: (c.name || [])[0] || "", phone: (c.tel || [])[0] || "", address };
    }).filter((c) => c.phone);
    if (add.length) paintCustRows(readCustRows().concat(add).slice(0, MAX_ADD));
  }
  function addCustomers() {
    openModal(`<h3>${T("cadd")}</h3>
      ${canPickContacts() ? `<button type="button" class="so-pick" id="ca-pick"><b>📱 ${T("cadd_pick")}</b><small>${T("cadd_pick_hint")}</small></button>` : ""}
      <div id="ca-rows" class="so-addrows"></div>
      <button type="button" class="so-addmore" id="ca-more">＋ ${T("cadd_more")}</button>
      <div class="err" id="ca-err"></div>
      <div class="btnrow"><button type="button" class="btn ghost" data-act="close">${T("cancel")}</button>
        <button type="button" class="btn go" id="ca-save">${T("cadd_save")}</button></div>`);
    paintCustRows([]);
    if ($("ca-pick")) $("ca-pick").onclick = pickContacts;
    $("ca-more").onclick = () => {
      if ($("ca-rows").children.length >= MAX_ADD) return;
      $("ca-rows").insertAdjacentHTML("beforeend", custRow());
      $("ca-rows").lastElementChild.querySelector(".ca-name").focus();
    };
    $("ca-rows").oninput = () => {
      const n = readCustRows().length;
      $("ca-save").textContent = n > 1 ? `${n} ${T("cadd_save")}` : T("cadd_save");
    };
    $("ca-rows").onclick = (e) => {
      if (!e.target.classList.contains("so-addx")) return;
      e.target.closest(".so-addrow").remove();
      if (!$("ca-rows").children.length) paintCustRows([]);
      $("ca-rows").oninput();
    };
    $("ca-save").onclick = saveCustomers;
    $("ca-rows").querySelector(".ca-name").focus();
  }
  async function saveCustomers() {
    const rows = readCustRows();
    const err = $("ca-err"), btn = $("ca-save");
    if (!rows.length || rows.some((c) => !c.name || !c.phone)) { err.textContent = T("cadd_need"); return; }
    btn.disabled = true; btn.textContent = T("cadd_saving"); err.textContent = "";
    let r;
    try { r = await api2("/customers/bulk", { method: "POST", body: { customers: rows } }); }
    catch (e) { err.textContent = e.message; btn.disabled = false; $("ca-rows").oninput(); return; }
    const done = r.added + r.updated;
    const msg = `${done} ${T("cadd_done")}${r.same ? ` · ${r.same} ${T("cadd_same")}` : ""}`;
    if (r.bad.length) {         // jo jud gaye wo gaye; bache hue wahin, theek karne ke liye
      paintCustRows(r.bad); btn.disabled = false; err.textContent = T("cadd_bad");
      toast(msg);
      customers({ quiet: true });
      return;
    }
    closeModal(); toast(msg);
    customers({ quiet: true });
  }

  async function customerSheet(ref) {
    openModal(`<div class="empty">…</div>`);
    let c;
    try { c = await api2(`/customers/${encodeURIComponent(ref)}`); } catch (e) { $("modal-body").innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    $("modal-body").innerHTML = `<h3>${esc(c.name)}</h3>
      <p class="hint">${esc(c.phone)}${c.since ? ` · ${shortDate(c.since)} ${T("since")}` : ""}${c.opted_out ? ` · <span class="tag late">${T("opted_out")}</span>` : ""}</p>
      <div class="so-tiles so-tiles3">
        <div class="so-tile"><b>${c.bills}</b><span>${T("bills_n")}</span></div>
        <div class="so-tile"><b>${money(c.paid)}</b><span>${T("paid_amt")}</span></div>
        <div class="so-tile"><b class="${c.due > 0 ? "so-due" : ""}">${money(c.due)}</b><span>${T("due")}</span></div>
      </div>
      ${c.can_locate ? `<div class="btnrow">${c.nav_url ? `<a class="btn go" href="${esc(c.nav_url)}" target="_blank" rel="noopener">🧭 ${T("loc_map")}</a>` : `<p class="hint">${T("loc_none")}</p>`}
        <button type="button" class="btn ghost" id="cs-loc">📍 ${T(c.nav_url ? "loc_update" : "loc_save")}</button></div>
        ${c.nav_url ? `<div class="btnrow"><button type="button" class="btn ghost wide" id="cs-locdel">🗑 ${T("loc_remove")}</button></div>` : ""}` : ""}
      ${c.due > 0 && !c.opted_out && c.orders.find((o) => o.due > 0) ? `<div class="btnrow"><button class="btn ghost" id="cs-remind">${T("remind")}</button><button class="btn go" id="cs-pay">${T("got_money")}</button></div>` : ""}
      <h3 class="so-h">${T("bills_n")}</h3>
      ${c.orders.map((o) => `<button type="button" class="so-line" data-num="${esc(o.number)}"><span><b>${esc(o.number)}</b> · ${esc(o.created)}<small>${esc(o.items || "")}</small></span>
        <span>${money(o.total)}${o.due > 0 ? `<small class="so-due">${money(o.due)} ${T("due")}</small>` : `<small class="so-ok">✓ ${T("paid")}</small>`}</span></button>`).join("")}
      ${c.payments.length ? `<h3 class="so-h">${T("payments")}</h3>${c.payments.map((x) => `<div class="kv"><span>${esc(x.at)} · ${esc(T(x.method) === x.method ? x.method : T(x.method))} · ${esc(x.number)}</span><b>${money(x.amount)}</b></div>`).join("")}` : ""}
      <div class="btnrow"><button class="btn ghost wide" data-act="close">${T("cancel")}</button></div>`;
    $("modal-body").querySelectorAll(".so-line").forEach((b) => { b.onclick = () => orderDetailModal(b.dataset.num); });
    if ($("cs-loc")) $("cs-loc").onclick = () => { closeModal(); askSaveLocation(c.customer_ref, c.name); };
    if ($("cs-locdel")) $("cs-locdel").onclick = () => { closeModal(); removeLocation(c.customer_ref, c.name); };
    const unpaid = c.orders.find((o) => o.due > 0);
    if ($("cs-remind") && unpaid) $("cs-remind").onclick = (e) => remindBill(unpaid.number, e.target);
    if ($("cs-pay") && unpaid) $("cs-pay").onclick = () => askCollect(unpaid.number, unpaid.due);
  }

  /* ---------- आज की बिक्री ---------- */
  async function todaySales(opts = {}) {
    $("chips").innerHTML = "";
    if (!opts.quiet) $("list").innerHTML = `<div class="empty">…</div>`;
    let d;
    try { d = await api2("/today"); } catch (e) { $("list").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (NAV !== "today") return;
    $("list").innerHTML = `
      <div class="so-tiles so-tiles3">
        <div class="so-tile"><b>${money(d.billed)}</b><span>${T("billed")}</span><small>${d.bills} ${T("bills_n")}</small></div>
        <div class="so-tile"><b>${money(d.collected)}</b><span>${T("collected")}</span></div>
        <div class="so-tile"><b class="${d.new_dues > 0 ? "so-due" : ""}">${money(d.new_dues)}</b><span>${T("new_dues")}</span></div>
      </div>
      ${d.by_method.length ? `<div class="card"><h3>${T("by_method")}</h3>${d.by_method.map((m) => `<div class="kv"><span>${esc(T(m.method) === m.method ? m.method : T(m.method))} · ${m.count}</span><b>${money(m.amount)}</b></div>`).join("")}</div>` : ""}
      ${d.orders.length ? d.orders.map(orderCard).join("") : `<p class="so-empty">${T("no_bills_today")}</p>`}`;
    wireCards($("list"), () => todaySales({ quiet: true }));
  }

  /* ---------- रिपोर्ट ---------- */
  let REP_MONTH = "";
  async function reports() {
    const now = new Date(), prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const months = [[ym(now), T("this_month")], [ym(prev), T("last_month")]];
    if (!months.some(([v]) => v === REP_MONTH)) REP_MONTH = months[0][0];
    $("chips").innerHTML = months.map(([v, l]) => `<button data-rep="${v}" class="${REP_MONTH === v ? "on" : ""}">${l}</button>`).join("");
    $("chips").querySelectorAll("[data-rep]").forEach((b) => { b.onclick = () => { REP_MONTH = b.dataset.rep; reports(); }; });
    $("list").innerHTML = `<div class="empty">…</div>`;
    let r;
    try { r = await api2("/reports?month=" + REP_MONTH); } catch (e) { $("list").innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (NAV !== "reports") return;
    if (r.detailed) { $("list").innerHTML = rangeCard() + proReport(r); paintBars(); wireRange(); return; }
    const kv = (a, b) => `<div class="kv"><span>${a}</span><b>${b}</b></div>`;
    let html = `<div class="so-tiles">
        <div class="so-tile"><b>${money(r.billed)}</b><span>${T("rep_billed")}</span><small>${r.bills} ${T("bills_n")}</small></div>
        <div class="so-tile"><b>${money(r.collected)}</b><span>${T("collected")}</span></div></div>
      <div class="card">${kv(T("rep_avg"), money(r.avg_bill))}${kv(T("rep_newc"), r.new_customers)}${kv(T("rep_dues"), money(r.dues_total))}</div>`;
    html += `<button type="button" class="card so-plan" data-nav2="plan"><p class="hint">🔒 ${T("rep_pro")}</p></button>`;
    $("list").innerHTML = rangeCard() + html;
    wireRange();
    $("list").querySelectorAll("[data-nav2]").forEach((b) => { b.onclick = () => go(b.dataset.nav2); });
  }
  /* Kisi bhi do tareekh ka hisaab — har Solo plan (solo_owner.py /reports/range) */
  function rangeCard() {
    const today = new Date().toLocaleDateString("en-CA"), first = today.slice(0, 8) + "01";
    return `<div class="card so-range"><h3>🗓 ${T("rr_title")}</h3>
      <div class="so-range-row"><label for="rr-from">${T("rr_from")}</label><input type="date" id="rr-from" value="${first}" max="${today}">
        <label for="rr-to">${T("rr_to")}</label><input type="date" id="rr-to" value="${today}" max="${today}"></div>
      <button type="button" class="btn go wide" id="rr-go">${T("rr_show")}</button><div id="rr-out"></div></div>`;
  }
  function wireRange() {
    const go1 = async (btn) => {
      const out = $("rr-out"); if (!out) return;
      let d;
      try { d = await api2(`/reports/range?date_from=${$("rr-from").value}&date_to=${$("rr-to").value}`); }
      catch (e) { out.innerHTML = `<p class="hint">${esc(e.message)}</p>`; return; }
      const m = d.received_by_method || {};
      const split = [["Cash", m.cash], ["UPI", m.upi], ["Card", m.card], ["Other", m.other]]
        .filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k} ${money(v)}`).join(" · ");
      const kv = (a, b) => `<div class="kv"><span>${a}</span><b>${b}</b></div>`;
      out.innerHTML = `<div class="so-tiles">
          <div class="so-tile"><b>${money(d.billed)}</b><span>${T("rep_billed")}</span><small>${d.bills} ${T("bills_n")}</small></div>
          <div class="so-tile"><b>${money(d.received)}</b><span>${T("rr_recv")}</span>${split ? `<small>${esc(split)}</small>` : ""}</div></div>
        ${Number(d.received_old) > 0 ? kv(T("rr_new"), money(d.received_new)) + kv(T("rr_old"), money(d.received_old)) : ""}${kv(T("rr_due"), money(d.to_collect))}${kv(T("rr_exp"), money(d.expenses))}${kv(T("rr_profit"), money(d.profit))}
        ${kv(T("rep_newc"), d.new_customers)}<p class="hint">${T("rr_note")}</p>`;
    };
    const b = $("rr-go"); if (!b) return;
    b.onclick = (e) => busy(e.target, () => go1());
    go1();
  }
  /* Pro ki report: mahine ka chart, service ka hissa, bade grahak */
  function proReport(r) {
    const [y, m] = r.month.split("-").map(Number), days = new Date(y, m, 0).getDate();
    const byDay = Object.fromEntries(r.daily.map((d) => [Number(d.date.slice(8)), d.billed]));
    const month = Array.from({ length: days }, (_, i) => ({ billed: byDay[i + 1] || 0 }));
    const total = r.by_service.reduce((a, x) => a + x.amount, 0) || 1;
    const tile = (a, b) => `<div><b>${a}</b><span>${b}</span></div>`;
    return `<div class="pp-hero">
        <div class="pp-hero-top"><span class="pp-lbl">${T("rep_billed")}</span>${deltaChip(r.billed, r.prev_billed, T("pp_vs"))}</div>
        <b class="pp-big">${money(r.billed)}</b>
        ${r.daily.length ? bars(month, "thin") : ""}
        <div class="pp-stats">${tile(money(r.collected), T("collected"))}${tile(r.bills, T("rep_bills"))}${tile(money(r.avg_bill), T("rep_avg"))}</div>
      </div>
      <div class="so-tiles">
        <div class="so-tile"><b>${r.new_customers}</b><span>${T("rep_newc")}</span></div>
        <div class="so-tile"><b>${money(r.dues_total)}</b><span>${T("rep_dues")}</span></div></div>
      <div class="pp-card"><h3>${T("rep_by_service")}</h3>${r.by_service.length ? r.by_service.map((x) => {
        const pct = Math.round(x.amount / total * 100);
        return `<div class="pp-share"><div class="so-top"><span>${esc(x.service)} · ${x.qty}</span><b>${money(x.amount)}</b></div><div class="so-bar"><i data-w="${pct}"></i></div><small>${pct}% ${T("pp_share")}</small></div>`;
      }).join("") : `<p class="so-empty">—</p>`}</div>
      <div class="pp-card"><h3>${T("rep_top")}</h3>${r.top_customers.length ? r.top_customers.map((x, i) => `<div class="pp-rank"><em>${i + 1}</em><span class="pp-grow"><b>${esc(x.name)}</b><small>${x.bills} ${T("bills_n")}</small></span><b>${money(x.amount)}</b></div>`).join("") : `<p class="so-empty">—</p>`}</div>`;
  }

  /* ---------- onboarding: 3 kadam ---------- */
  async function onboarding() {
    let ob;
    try { ob = await api2("/onboarding"); } catch (e) { return; }
    if (ob.done) return;
    const step1 = () => openModal(`<h3>${T("ob_title")}</h3><p class="said">${T("ob_1")}</p>
      <label for="ob-name">${T("shop_name")}</label><input id="ob-name" value="${esc(ME.shop || "")}" maxlength="120">
      <label for="ob-addr">${T("address")}</label><input id="ob-addr" maxlength="300">
      <label for="ob-upi">${T("upi")}</label><input id="ob-upi" maxlength="80" placeholder="naam@upi">
      <div class="btnrow"><button class="btn go wide" id="ob-n1">${T("next")}</button></div>`, "so-ob");
    const step2 = () => openModal(`<h3>${T("ob_2")}</h3><p class="said">${T("ob_svc_hint")}</p>
      <div class="so-checks">${ob.starter.services.map((s, i) => `<label><input type="checkbox" value="${esc(s)}" ${i === 0 ? "checked" : ""}> ${esc(s)} <small>${ob.starter.items[s].slice(0, 4).map((x) => x[0]).join(", ")}…</small></label>`).join("")}</div>
      <p class="said">${T("ob_kg")}</p>
      <div class="so-checks">${Object.entries(ob.starter.kg).map(([s, r]) => `<label><input type="checkbox" data-kg value="${esc(s)}"> ${esc(s)} <small>₹${r}/${T("kg")}</small></label>`).join("")}</div>
      <div class="btnrow"><button class="btn ghost" id="ob-s2">${T("skip")}</button><button class="btn go" id="ob-n2">${T("next")}</button></div>`, "so-ob");
    const step3 = () => openModal(`<h3>${T("ob_3")}</h3><p class="said">${T("wa_off")}</p>
      <div class="btnrow"><button class="btn ghost" id="ob-s3">${T("skip")}</button><button class="btn go" id="ob-n3">${T("wa_btn")}</button></div>`, "so-ob");
    const finish = async () => { try { await api2("/onboarding/done", { method: "POST", body: {} }); } catch (e) { /* agli baar */ }
      ME.onboarding_done = true; closeModal(); toast(T("done") + " " + T("ob_done_hint"), false, 6000); go("home"); };
    step1();
    $("ob-n1").onclick = (e) => busy(e.target, async () => {
      const body = { shop_name: $("ob-name").value.trim(), shop_address: $("ob-addr").value.trim(), upi_vpa: $("ob-upi").value.trim() };
      if (body.shop_name.length < 2) { toast(T("shop_name"), true); return; }
      const r = await api2("/shop", { method: "PUT", body }); ME.shop = r.shop_name;
      step2();
      $("ob-s2").onclick = () => { step3(); wire3(); };
      $("ob-n2").onclick = (e2) => busy(e2.target, async () => {
        const services = [...$("modal-body").querySelectorAll("input[type=checkbox]:not([data-kg]):checked")].map((i) => i.value);
        const kg = [...$("modal-body").querySelectorAll("input[data-kg]:checked")].map((i) => i.value);
        if (services.length || kg.length) await api2("/onboarding/rates", { method: "POST", body: { services: services.length ? services : [ob.starter.services[0]], kg } });
        step3(); wire3();
      });
    });
    const wire3 = () => {
      $("ob-s3").onclick = finish;
      $("ob-n3").onclick = (e) => busy(e.target, async () => { try { await api2("/whatsapp-request", { method: "POST", body: {} }); } catch (err) { /* chalo */ } await finish(); });
    };
  }

  window.Solo = { T, navItems, handles, route, me, onboarding, NAVS };
})();
