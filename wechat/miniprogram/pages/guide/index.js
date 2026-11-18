const config=require('../../config');
Page({data:{contact:config.contact,version:config.version},back(){wx.navigateBack();}});
