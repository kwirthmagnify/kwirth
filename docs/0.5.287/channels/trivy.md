# Trivy
We are very proud of one of the last channels we have added to Kwirth: the Trivy Channel. This channel is based on [Trivy OSS](https://trivy.io). Trivy is an excellent piece of software for observing your cybersecurity threats and being aware of your cybersecurity posture.

Kwirth relies on Trivy to send real-time information about the vulnerabilities of your Kubernetes objects.

## What for
With Trivy Channel you can:

  - Have a score of the security compliance of your Kubernetes objects. As it always happens with Kwirth, you can calculate the Kwirth Security Score on a customized set of objects. Typically, you would use Trivy Channel to calculate a security exposure about all the components that comprise an application, no matter the namespace they are running on, no matter if they are pods, replica sets, or just individual containers.
  - For each analyzed object, and based on the information provided by Trivy, you can review what vulnerabilities are present in your images (knowing the specific CVE identifier), which versions are impacted by a CVE, which version contains the fix, etc. (this information is, of course, provided by Trivy).
  - You can define a dynamic way of calculating Kwirth Security Score by configuring the number of accepted vulnerabilities of each kind (critical, high, medium, low). Ideally, you would set up a fixed configuration for all of your items.

## Features
These are key features of Trivy channel:

  - Calculate Kwirth Secure Score, an overall value that assesses your cybersecurity posture.
  - Review vulnerability reports for each object in scope individually.
  - Review each CVE for each impacted object individually.
  - Re-evaluate a vulnerability report for a specific object.

## Use
When you start a Trivy Channel you must provide a few things for the vulnerability engine to run and show you some results:

  - **Maximum number of accepted issues** of each category of vulnerability, or even just ignore a specific severity (that means accepting as "good" any number of vulnerabilities of a specific kind).

![trivysetup](../_media/ch-images/trivy-setup.png ':class=imageclass40')

Here are some screenshots of some operations performed with a Trivy Channel. First one shows a general view of a Trivy Channel:

![trivycard](../_media/ch-images/trivy-card.png ':class=imageclass100')

You can switch the view (a card view with details on each object) to a list view, a more simplistic approach to use when you just need an overview of the global situation.

![trivylist](../_media/ch-images/trivy-list.png ':class=imageclass100')

No matter the kind of view you have selected (card or list), you can decide how to order the objects. Two main options are available: score order, scan date order.

![trivyorder](../_media/ch-images/trivy-sort.png ':class=imageclass20')

If you want to review the details of a vulnerability report, you can do it (from card or list item) and you will get a list of vulnerabilities including its category (critical, high...) and some details.

![trivydetail](../_media/ch-images/trivy-detail.png ':class=imageclass40')

If you want to get detailed info on a specific CVE, just click on it to see the details.

![trivycve](../_media/ch-images/trivy-cve.png ':class=imageclass40')

If there is a problem with a Trivy vulnerability report, you'll be notified via a red error icon on the screen, and clicking on it you can see some specifics on the error.

![trivyerror](../_media/ch-images/trivy-error.png ':class=imageclass40')
