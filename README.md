# Export Insights #

Make a backup of all your insights to your NAS or WebDAV compliant storage.
The insights are zipped and stored in .csv format so you can open them in excel
and create all kinds of statistics and charts.

Backups can be easily scheduled by using the trigger card in a flow. You can
schedule a full backup, or a backup per app.

![image][flow-cards-image]

To setup enter the local share (NAS) information and/or the webDAV information.
It is possible to use a local share and a webDAV storage simultaneously.

![image][setup-image]

Note: making a backup can take a long time (more than 10 minutes), depending on
how many insights you have. It is not possible to restore a backup into Homey.

For requests or remarks, visit the [forum].

##### Donate: #####
If you like the app do not hesitate to donate a cool drink :)

[![Paypal donate][pp-donate-image]][pp-donate-link]

===============================================================================

Version changelog: [changelog.txt]

[forum]: https://community.athom.com/t/10976
[flow-cards-image]: https://community.athom.com/uploads/athom/original/2X/9/9a912355de6b41733902e5c244ee98b6e01a5701.png
[setup-image]: https://discourse-cdn-sjc1.com/business4/uploads/athom/original/2X/f/f6f3d116a11c3f1b65c570ccc54534f2437182c1.png
[pp-donate-link]: https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=TDC4FASRLXCUY
[pp-donate-image]: https://www.paypalobjects.com/en_US/i/btn/btn_donate_SM.gif
[changelog.txt]: https://github.com/gruijter/com.gruijter.insights2csv/blob/beta/changelog.txt