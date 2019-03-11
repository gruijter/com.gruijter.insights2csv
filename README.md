# Export Insights #

Make a backup of all your insights to your NAS or WebDAV compliant storage.
The insights are zipped and stored in .csv format so you can open them in excel
and create all kinds of statistics and charts.

Backups can be easily scheduled by using the trigger card in a flow. You can
schedule a full backup, or a backup per app.

To setup enter the local share (NAS) information and/or the webDAV information.
It is possible to use a local share and a webDAV storage simultaneously.

![image][flow-cards-image]

Note: making a backup can take a long time (more than 10 minutes), depending on
how many insights you have. It is not possible to restore a backup into Homey.

For requests or remarks, visit the [forum].

##### Donate: #####
If you like the app do not hesitate to donate a cool drink :)

[![Paypal donate][pp-donate-image]][pp-donate-link]

===============================================================================

Version changelog

```
v2.1.0  2018.02.05 Added backup to local network share (smb).
v2.0.0  2018.02.04 Complete rewrite to SDK2. Flows need to be repaired!
v0.0.2  2017.06.05 Added per-app backup
v0.0.1  2017.05.19 Initial release
```
[forum]: https://forum.athom.com/discussion/4621
[flow-cards-image]: https://forum.athom.com/uploads/editor/lb/ctvpqiujfpca.png
[pp-donate-link]: https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=TDC4FASRLXCUY
[pp-donate-image]: https://www.paypalobjects.com/en_US/i/btn/btn_donate_SM.gif
