export const dynamic = 'force-static';


export default function BookPage(){
return (
<section className="container-px py-20 max-w-5xl mx-auto">
<h1 className="text-4xl font-bold mb-6">Book a Session</h1>
<p className="text-neutral-600 mb-8">Choose a time for date night, team event, or private group.</p>



<iframe src="https://app.acuityscheduling.com/schedule.php?owner=36703748&ref=embedded_csp" title="Schedule Appointment" width="100%" height="800" frameBorder="0" allow="payment"></iframe><script src="https://embed.acuityscheduling.com/js/embed.js" type="text/javascript"></script>


</section>
);
}