# Carton labels: station checklist (V7 and V8)

Run this on a real packing station with the Brother QL-800 after installing the
new desktop build. The automated tests use a fake printer; this is the part
only a real printer can prove. It takes about 20 minutes.

## Before you start

- Build and install the new station app: `npm run build:electron` in `frontend`
  (or the usual release). The website alone is not enough: the printer code
  runs inside the desktop app.
- Pick a test order in a week that is not being packed, or a real order you
  will reprint anyway. Write down its customer name.
- Open **פעולות מתקדמות** on that order. At the bottom is
  **יומן הדפסות בתחנה**: every press of the print button is listed there with
  the time, the carton number, the result, how long it took, and whether the
  customer's carton count was saved. Open it after each step below.

For every step, the result to check is the same three things:
the label that came out, the number in the **קרטון #** field afterwards, and
the line in the print log.

## Steps

| # | What to do | What should happen |
|---|---|---|
| 1 | Open the order. Press **הדפס מדבקה** once. | One label, "קרטון 1#". The message "מודפס קרטון 1#" appears as soon as the label is out. The field shows 2. Log: הודפס · נשמר. |
| 2 | Press the print button five times as fast as you can. | One label only. The button greys out ("מדפיס…", then briefly "שומר…") and ignores the other taps. The field moves up by one. Log: one new line. |
| 3 | Unplug the network cable (or turn off Wi-Fi). Print one label. | The label prints. Message: "המדבקה הודפסה, אבל מספר הקרטונים לא נשמר ללקוח". The button is free again within about 8 seconds. Log: הודפס · ממתין לאינטרנט. |
| 4 | Plug the network back in. Wait up to one minute. | Log line from step 3 changes to נשמר (close and reopen the log). In the admin order view, the customer's carton count equals the last carton printed. |
| 5 | Two stations, same order: print one label on station A. Then open the order on station B (or keep it open there). | Station B's field shows the next number after A's label, never one A already printed. Print on B: the number continues. |
| 6 | Charge an order that has labels, then open it again and print one more. | The new label continues the count (for example "קרטון 3#" after two), not "קרטון 1#". |
| 7 | Type a different number in the carton field, for example 2, and press Enter. Print. | "קרטון 2#" prints (use this to reprint a torn label). Clear the field completely while typing: it stays empty until you leave it, then returns to the previous number. |
| 8 | Run the roll empty (or open the roll compartment so no label is detected). Print. | No number is used up: the field stays the same. Message: "הגליל נגמר…" or "אין גליל במדפסת". Log: the error, in red. Load a roll and print again: same number. |
| 9 | Open the cover. Print. | Message "המכסה פתוח". Field unchanged. Close the cover, print: same number. |
| 10 | In the middle of an order (two labels printed), close the station app and open it again. Open the same order. | The field shows the next number (3), not 1. |
| 11 | V8 picking view (**ליקוט**): press **הדפס מדבקות חסרות** twice quickly. | Each box gets exactly one label. The badge on each box shows "הודפסו 1". |
| 12 | V8: on a box that already has labels, press its **הדפס מדבקה**. | The number continues from that box's count. |

## If the printer did not confirm

Sometimes the printer prints but does not report back in time. The station then
asks **"המדבקה יצאה?"** (in Hebrew and Thai). Answer by looking at the printer:

- Yes, the label is there: the number counts as printed and the field moves on.
  Log: "הודפס (אושר ידנית)".
- No label: nothing is used up; press print again for the same number.

If this question appears often, note the durations in the log and send them.

## What to send back

A photo or copy of the print log after the run (it keeps the last 50 attempts on
that station), and the number of any step that did not behave as written.
